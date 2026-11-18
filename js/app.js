// Lapisan data dan tampilan bersama: Firestore + helper UI.
import { db, doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction, ensureUser } from './firebase.js';
import * as E from './engine.js';

export { E, ensureUser };

export const roomRef = code => doc(db, 'rooms', code);
export const secretRef = (code, id) => doc(db, 'rooms', code, 'secret', id);

export const SECTOR_NAME = { konsumer: 'Konsumer', keuangan: 'Keuangan', tambang: 'Tambang', agrikultur: 'Agrikultur', reksadana: 'Reksadana' };
export const SECTOR_COLOR = { konsumer: '#2563eb', keuangan: '#d97706', tambang: '#e11d48', agrikultur: '#059669', reksadana: '#0d9488' };
export const ACTION_DESC = {
  'Quickbuy': 'Ambil kartu ini dan 1 kartu lain dari meja, keduanya jadi saham Anda. Kartu kedua tanpa efek. Giliran Anda berikutnya di ronde ini hangus.',
  'Info Bursa': 'Intip kartu Ekonomi paling atas dari tepat 3 sektor saham (rahasia).',
  'Akuisisi': 'Ambil 1 kartu saham dari lawan (non-Reksadana). Saham Anda di sektor itu harus lebih banyak atau sama. Kartu Reksadana boleh memilih sektor apa pun. Lawan dapat +4 Koin.',
  'Trading Fee': 'Bayar 1 Koin per saham sektor ini termasuk kartu ini. Boleh langsung jual semua saham 1 jenis.',
  'Rumor': 'Pilih 1 sektor naik/turun 2 langkah, atau 2 sektor berbeda masing-masing 1 langkah di papan.',
};
export const STEP_LABEL = {
  lobby: 'Menunggu pemain', bidding: 'Fase I • Lelang', action: 'Fase II • Aksi', sell: 'Fase III • Jual',
  economy: 'Fase IV • Ekonomi (menunggu bandar)', economy_done: 'Fase IV selesai', ended: 'Permainan selesai',
};

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtDelta = c => (c.purple ? c.name : `${c.name} (${c.delta > 0 ? '+' : ''}${c.delta})`);

export function toast(msg, kind = 'info') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  const color = kind === 'error' ? 'bg-rose-700' : kind === 'ok' ? 'bg-emerald-700' : 'bg-slate-800';
  el.className = `${color} text-white text-sm px-4 py-2 rounded-xl shadow-lg`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ---------- membaca data (real-time) ----------
export function subscribeDoc(ref, cb, onErr) {
  return onSnapshot(ref,
    snap => cb(snap.exists() ? snap.data() : null),
    err => { console.error(err); if (onErr) onErr(err); });
}

// ---------- ruangan ----------
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  const a = new Uint32Array(5);
  crypto.getRandomValues(a);
  return Array.from(a, x => CODE_CHARS[x % CODE_CHARS.length]).join('');
}

export async function createRoom() {
  const user = await ensureUser();
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const ref = roomRef(code);
    if ((await getDoc(ref)).exists()) continue;
    const room = E.newRoomDoc(code, user.uid);
    room.uids = [user.uid];
    await setDoc(ref, room);
    return code;
  }
  throw new Error('Gagal membuat kode ruangan, coba lagi.');
}

export async function joinRoom(code, name) {
  const user = await ensureUser();
  await runTransaction(db, async tx => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) throw new Error('Ruangan tidak ditemukan');
    const room = snap.data();
    if (room.players.some(p => p.uid === user.uid)) return;
    E.addPlayer(room, user.uid, name);
    tx.set(roomRef(code), room);
  });
  return user.uid;
}

// Aksi pemain: membaca dan menulis dokumen ruangan dalam satu transaksi.
// fn mengubah `room`; kembalikan false untuk membatalkan penulisan.
export function transact(code, fn) {
  return runTransaction(db, async tx => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) throw new Error('Ruangan tidak ditemukan');
    const room = snap.data();
    if (fn(room) === false) return;
    tx.set(roomRef(code), room);
  });
}

// Aksi bandar: ikut membaca dek rahasia dan dokumen rahasia semua pemain.
// fn(room, secret, ps) -- ps = { [uid]: { bid, peek } }
export function transactBank(code, fn) {
  return runTransaction(db, async tx => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) throw new Error('Ruangan tidak ditemukan');
    const room = snap.data();
    const bankSnap = await tx.get(secretRef(code, 'bank'));
    const secret = bankSnap.exists() ? bankSnap.data() : {};
    const ps = {};
    for (const p of room.players) {
      const s = await tx.get(secretRef(code, p.uid));
      ps[p.uid] = s.exists() ? s.data() : { bid: null, peek: {} };
    }
    if (fn(room, secret, ps) === false) return;
    tx.set(roomRef(code), room);
    tx.set(secretRef(code, 'bank'), secret);
    for (const p of room.players) tx.set(secretRef(code, p.uid), ps[p.uid]);
  });
}

// Bandar mengisi intipan yang diminta pemain (dipakai sebelum dek dibuka).
export function applyPeeks(room, secret, ps) {
  const out = E.fulfillPeeks(room, secret);
  for (const uid in out) ps[uid] = { ...(ps[uid] || { bid: null }), peek: out[uid] };
}

// Lelang: simpan tawaran rahasia di dokumen sendiri, lalu kunci di ruangan.
export async function submitBid(code, uid, me, amount) {
  const n = E.validBid(me, amount);
  await updateDoc(secretRef(code, uid), { bid: n });
  await transact(code, r => { E.markBid(r, uid); });
}
