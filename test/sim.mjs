// Simulasi game penuh dengan mesin di js/engine.js.
// Jalankan: node test/sim.mjs
import * as E from '../js/engine.js';

const rnd = n => Math.floor(Math.random() * n);

// Firestore menolak nilai undefined dan array bersarang. Periksa keduanya.
function checkFirestoreSafe(obj, path = 'room') {
  if (obj === undefined) throw new Error(`undefined di ${path}`);
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      if (Array.isArray(v)) throw new Error(`array bersarang di ${path}[${i}]`);
      checkFirestoreSafe(v, `${path}[${i}]`);
    });
  } else if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) checkFirestoreSafe(obj[k], `${path}.${k}`);
  }
}

function playOne() {
  const room = E.newRoomDoc('TEST1', 'bank-uid');
  room.uids = ['bank-uid'];
  ['u1', 'u2', 'u3'].forEach((uid, i) => E.addPlayer(room, uid, ['Ani', 'Budi', 'Cika'][i]));
  const secret = E.startGame(room);
  const ps = {};
  E.dealRound(room, secret, ps);

  let guard = 0;
  while (room.status !== 'ended') {
    if (++guard > 5000) throw new Error('Permainan tidak berakhir (macet)');

    if (room.step === 'bidding') {
      for (const p of room.players) {
        const mx = Math.max(0, p.coins), lo = mx >= 1 ? 1 : 0;
        const amt = lo + rnd(mx - lo + 1);
        ps[p.uid].bid = E.validBid(p, amt);
        E.markBid(room, p.uid);
      }
      // Bandar menyelesaikan lelang
      E.resolveBidding(room, Object.fromEntries(room.players.map(p => [p.uid, ps[p.uid].bid])));
    } else if (room.step === 'action') {
      const uid = E.actorId(room);
      const opts = E.options(room, uid);
      const legal = room.tableCards.filter(c => opts[c.id].canSave || opts[c.id].canActivate);
      if (!legal.length) throw new Error('Tidak ada langkah legal (seharusnya tidak terjadi)');
      const card = legal[rnd(legal.length)];
      const o = opts[card.id];

      if (o.canActivate && (!o.canSave || Math.random() < 0.6)) {
        const a = { cardId: card.id, mode: 'activate' };
        if (card.action === 'Quickbuy') {
          a.cardIds = [room.tableCards.find(c => c.id !== card.id).id];
        } else if (card.action === 'Info Bursa') {
          a.sectors = [...room.sectorOrder].slice(0, 3);
        } else if (card.action === 'Akuisisi') {
          a.targetUid = o.targets[0].uid; a.targetSector = o.targets[0].sector;
        } else if (card.action === 'Trading Fee') {
          a.sellSector = E.ALL[rnd(5)];
        } else if (card.action === 'Rumor') {
          const [s1, s2] = [...room.sectorOrder].sort(() => Math.random() - 0.5);
          const d = () => (Math.random() < 0.5 ? 1 : -1);
          a.changes = Math.random() < 0.5
            ? [{ sector: s1, delta: 2 * d() }]
            : [{ sector: s1, delta: d() }, { sector: s2, delta: d() }];
        }
        E.takeCard(room, uid, a);
      } else {
        E.takeCard(room, uid, { cardId: card.id, mode: 'save' });
      }
    } else if (room.step === 'sell') {
      const uid = E.actorId(room);
      const p = E.findPlayer(room, uid);
      const owned = E.holdingsOf(room, p).filter(h => h.shares > 0);
      if (owned.length && Math.random() < 0.5) {
        const h = owned[rnd(owned.length)];
        E.sellSector(room, uid, { sector: h.sector, qty: 1 });
      } else {
        E.holdSell(room, uid);
      }
    } else if (room.step === 'economy') {
      const peeks = E.fulfillPeeks(room, secret);
      for (const uid in peeks) ps[uid] = { ...ps[uid], peek: peeks[uid] };
      E.revealEconomy(room, secret);
    } else if (room.step === 'economy_done') {
      for (const p of room.players) {
        while (p.owe > 0) {
          const flip = p.cards.find(c => !c.isDebt && c.sector !== 'reksadana');
          E.takeDebt(room, p.uid, flip.id);
        }
      }
      E.nextRound(room, secret, ps);
    }

    // Invarian
    for (const p of room.players) {
      if (p.coins < 0) throw new Error(`Koin negatif: ${p.coins}`);
    }
    for (const sec of E.SECTORS) {
      const pr = room.prices[sec];
      if (!E.TRACKS[sec].includes(pr)) throw new Error(`Harga ${sec} di luar batas: ${pr}`);
    }
    checkFirestoreSafe(room);
  }
  return room;
}

let ok = 0;
for (let i = 0; i < 300; i++) {
  const room = playOne();
  if (!room.standings || room.standings.length !== 3) throw new Error('Klasemen tidak lengkap');
  ok++;
}
const sample = playOne();
console.log(`Lulus ${ok}/300 game penuh.`);
console.log('Contoh klasemen:', sample.standings.map(s => `${s.name}=${s.score}`).join(', '));
