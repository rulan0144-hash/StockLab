// Mesin StockLab untuk browser. Tidak bergantung pada Firebase.
//  - room   : data publik ruangan (dilihat semua tampilan)
//  - secret : dek bandar (economy, actionDeck) - hanya bandar
//  - ps     : dokumen rahasia tiap pemain { bid, peek } - pemilik dan bandar

export const SECTORS = ['konsumer', 'keuangan', 'tambang', 'agrikultur'];
export const ALL = [...SECTORS, 'reksadana'];
export const SHORT = { konsumer: 'Konsumer', keuangan: 'Keuangan', tambang: 'Tambang', agrikultur: 'Agrikultur', reksadana: 'Reksadana' };
export const START_COINS = 15;
export const START_PRICE = 5;
// Papan harga tiap sektor: angka yang tertera di papan, dari rendah ke tinggi.
// Satu "poin" pada kartu = satu langkah di papan ini. Di bawah ujung bawah = Stock Crash, di atas ujung atas = Stock Split.
export const TRACKS = {
  tambang: [2, 3, 5, 6, 8, 9],
  konsumer: [1, 2, 3, 4, 5, 6, 7, 8],
  keuangan: [1, 3, 4, 5, 6, 7, 9],
  agrikultur: [1, 2, 4, 5, 6, 8, 9],
};
const startPos = sec => TRACKS[sec].indexOf(START_PRICE);
function setPos(room, sec, pos) { room.pos[sec] = pos; room.prices[sec] = TRACKS[sec][pos]; }
export const MAX_ROUNDS = 6;
export const DEBT_LOAN = 10;
export const DEBT_PENALTY = 13;
export const ACQ_BONUS = 4;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

const randInt = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
export const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- dek ----------
function buildEconomyDeck() {
  const pool = [];
  const add = (n, card) => { for (let i = 0; i < n; i++) pool.push({ ...card, id: rid() }); };
  add(6, { name: 'Melaju', delta: 2, purple: null });
  add(7, { name: 'Menguat', delta: 1, purple: null });
  add(3, { name: 'Stagnan', delta: 0, purple: null });
  add(5, { name: 'Anjlok', delta: -1, purple: null });
  add(3, { name: 'Krisis', delta: -2, purple: null });
  add(2, { name: 'Lonjakan Sektor', delta: 3, purple: 'sector_surge' });
  add(1, { name: 'Krisis Pasar', delta: 0, purple: 'market_crisis' });
  add(2, { name: 'Dividen Khusus', delta: 0, purple: 'dividend' });
  add(1, { name: 'Booming Tengah', delta: 0, purple: 'center_boom' });
  return shuffle(pool); // 30 kartu
}

function buildActionDeck() {
  const deck = [];
  const push = (n, sector, action) => { for (let i = 0; i < n; i++) deck.push({ id: rid(), sector, action }); };
  for (const s of SECTORS) {
    push(3, s, 'Quickbuy'); push(3, s, 'Akuisisi');
    push(2, s, 'Info Bursa'); push(2, s, 'Trading Fee'); push(2, s, 'Rumor');
  }
  // Reksadana juga punya kelima jenis kartu (12 kartu)
  push(3, 'reksadana', 'Quickbuy'); push(3, 'reksadana', 'Akuisisi');
  push(2, 'reksadana', 'Info Bursa'); push(2, 'reksadana', 'Trading Fee'); push(2, 'reksadana', 'Rumor');
  return shuffle(deck); // 60 kartu
}

// ---------- ruang & pemain ----------
export function newRoomDoc(code, bankUid) {
  return {
    code, bankUid, uids: [], status: 'lobby', step: 'lobby', round: 0, maxRounds: MAX_ROUNDS,
    sectorOrder: [], prices: {}, pos: {}, tableCards: [], discard: [], deckCount: 0, economyLeft: {},
    lastEconomy: null, bidResult: null, actionIdx: 0, sellIdx: 0, peekRequests: [],
    players: [], log: [], standings: null, createdAt: Date.now(),
  };
}

export const ordered = room => [...room.players].sort((a, b) => a.order - b.order);
export function findPlayer(room, uid) {
  const p = room.players.find(x => x.uid === uid);
  if (!p) throw new Error('Pemain tidak ditemukan');
  return p;
}
export const activeCards = (p, sec) => p.cards.filter(c => !c.isDebt && c.sector === sec);
export const shares = (p, sec) => activeCards(p, sec).reduce((s, c) => s + c.multiplier, 0);
const splitMult = (p, sec) => { const a = activeCards(p, sec); return a.length ? Math.max(...a.map(c => c.multiplier)) : 1; };
export const debtCount = p => p.cards.filter(c => c.isDebt).length;
function reksadanaPrice(room) {
  if (room.sectorOrder.length !== 4) return 0;
  const [, m1, m2] = room.sectorOrder;
  return Math.floor((room.prices[m1] + room.prices[m2]) / 2);
}
export function priceOf(room, sec) { return sec === 'reksadana' ? reksadanaPrice(room) : (room.prices[sec] || 0); }
export const worthOf = (room, p) =>
  p.coins + ALL.reduce((s, sec) => s + shares(p, sec) * priceOf(room, sec), 0) - debtCount(p) * DEBT_PENALTY;
export function holdingsOf(room, p) {
  return ALL.map(sec => ({
    sector: sec, shares: shares(p, sec),
    split: sec === 'reksadana' ? 1 : splitMult(p, sec),
    value: shares(p, sec) * priceOf(room, sec),
  }));
}
function newHolding(p, sector) {
  return { id: rid(), sector, isDebt: false, multiplier: sector === 'reksadana' ? 1 : splitMult(p, sector) };
}
function removeFromTable(room, id) { room.tableCards = room.tableCards.filter(c => c.id !== id); }
export function log(room, text) { room.log = [{ round: room.round, text }, ...(room.log || [])].slice(0, 80); }
export function actorId(room) {
  if (room.step === 'action') return ordered(room)[room.actionIdx]?.uid ?? null;
  if (room.step === 'sell') return ordered(room)[room.sellIdx]?.uid ?? null;
  return null;
}
export function countEconomy(room, secret) {
  return Object.fromEntries(room.sectorOrder.map(s => [s, secret.economy[s].length]));
}

export function addPlayer(room, uid, name) {
  if (room.players.some(p => p.uid === uid)) return;
  if (uid === room.bankUid) throw new Error('Bandar tidak bisa ikut sebagai pemain');
  if (room.status !== 'lobby') throw new Error('Permainan sudah dimulai');
  if (room.players.length >= MAX_PLAYERS) throw new Error('Ruangan sudah penuh');
  const clean = String(name || '').trim().slice(0, 20);
  if (!clean) throw new Error('Nama wajib diisi');
  if (room.players.some(p => p.name.toLowerCase() === clean.toLowerCase())) throw new Error('Nama sudah dipakai');
  room.players.push({ uid, name: clean, order: room.players.length + 1, coins: START_COINS, cards: [], lastBid: null, bidDone: false, skipTurn: false });
  room.uids = [...room.uids.filter(u => u !== uid), uid];
  log(room, `${clean} bergabung ke meja.`);
}

// ---------- alur bandar ----------
// Mengubah lobi menjadi permainan. Mengembalikan dek rahasia untuk disimpan bandar.
export function startGame(room) {
  if (room.status !== 'lobby') throw new Error('Permainan sudah berjalan');
  if (room.players.length < MIN_PLAYERS) throw new Error(`Minimal ${MIN_PLAYERS} pemain`);
  room.status = 'playing';
  room.sectorOrder = shuffle(SECTORS);
  room.pos = {}; room.prices = {};
  SECTORS.forEach(sec => setPos(room, sec, startPos(sec)));
  const eco = buildEconomyDeck();
  const economy = {};
  room.sectorOrder.forEach((s, i) => { economy[s] = eco.slice(i * 6, (i + 1) * 6); });
  const orders = shuffle(room.players.map((_, i) => i + 1));
  room.players.forEach((p, i) => { p.order = orders[i]; p.coins = START_COINS; p.cards = []; p.lastBid = null; p.bidDone = false; });
  room.round = 1; room.discard = []; room.peekRequests = []; room.lastEconomy = null;
  room.log = [];
  log(room, 'Permainan dimulai. Modal 15 Koin per pemain.');
  return { economy, actionDeck: buildActionDeck() };
}

// Membuka ronde: membagi kartu aksi ke meja dan mengosongkan lelang serta intipan lama.
export function dealRound(room, secret, ps) {
  room.step = 'bidding'; room.bidResult = null; room.actionIdx = 0; room.sellIdx = 0;
  room.tableCards = secret.actionDeck.splice(0, room.players.length * 2);
  room.deckCount = secret.actionDeck.length;
  room.economyLeft = countEconomy(room, secret);
  room.players.forEach(p => { p.bidDone = false; p.skipTurn = false; });
  for (const p of room.players) ps[p.uid] = { bid: null, peek: {} };
  log(room, `Ronde ${room.round}: ${room.tableCards.length} kartu aksi dibuka. Ajukan lelang tertutup.`);
}

export function nextRound(room, secret, ps) {
  if (room.step !== 'economy_done') throw new Error('Selesaikan Fase Ekonomi terlebih dahulu');
  if (room.round >= MAX_ROUNDS) return finish(room);
  room.round += 1;
  dealRound(room, secret, ps);
}

export function finish(room) {
  room.status = 'ended'; room.step = 'ended';
  room.standings = ordered(room).map(p => ({
    uid: p.uid, name: p.name, coins: p.coins, order: p.order,
    stockValue: ALL.reduce((s, sec) => s + shares(p, sec) * priceOf(room, sec), 0),
    debts: debtCount(p), score: worthOf(room, p),
  })).sort((a, b) => b.score - a.score || a.order - b.order);
  log(room, `Permainan selesai! Pemenang: ${room.standings[0].name}.`);
}

// ---------- lelang ----------
export function markBid(room, uid) {
  if (room.step !== 'bidding') throw new Error('Belum fase lelang');
  const p = findPlayer(room, uid);
  if (p.bidDone) throw new Error('Anda sudah mengunci lelang');
  p.bidDone = true;
  log(room, `${p.name} telah mengunci lelang tertutup.`);
}

export function validBid(p, amount) {
  const n = Math.floor(Number(amount));
  const min = p.coins >= 1 ? 1 : 0;
  if (!Number.isFinite(n) || n < min || n > p.coins) throw new Error(`Lelang harus antara ${min} dan ${p.coins} Koin`);
  return n;
}

// bids: { [uid]: angka }. Tawaran tertinggi mendapat urutan 1; seri dimenangkan urutan lama.
export function resolveBidding(room, bids) {
  const entries = room.players.map(p => {
    const raw = Math.floor(Number(bids[p.uid]) || 0);
    const bid = Math.max(0, Math.min(p.coins, raw));
    return { p, bid, prev: p.order };
  });
  entries.sort((a, b) => b.bid - a.bid || a.prev - b.prev);
  entries.forEach((e, i) => { e.p.coins -= e.bid; e.p.lastBid = e.bid; e.p.order = i + 1; });
  room.bidResult = entries.map(e => ({ uid: e.p.uid, name: e.p.name, bid: e.bid, order: e.p.order }));
  room.step = 'action'; room.actionIdx = 0; room.sellIdx = 0;
  log(room, 'Lelang dibuka: ' + room.bidResult.map(r => `#${r.order} ${r.name} (${r.bid} Koin)`).join(' · '));
}

// ---------- aksi pemain ----------
// Target Akuisisi: { uid, name, sector, shares }. Kartu sektor biasa hanya menargetkan sektornya sendiri.
// Kartu Akuisisi Reksadana boleh menargetkan saham sektor apa pun milik lawan.
// Syarat: saham pengakuisi di sektor itu lebih banyak atau sama dengan lawan. Reksadana tidak bisa diambil.
function acquisitionTargets(room, p, cardSector) {
  const secs = cardSector === 'reksadana' ? SECTORS : [cardSector];
  const out = [];
  for (const sec of secs) {
    const mine = shares(p, sec);
    for (const o of room.players) {
      if (o.uid === p.uid) continue;
      const theirs = shares(o, sec);
      if (theirs >= 1 && mine >= theirs) out.push({ uid: o.uid, name: o.name, sector: sec, shares: theirs });
    }
  }
  return out;
}

export function evaluate(room, p, card) {
  const owned = shares(p, card.sector);
  // Trading Fee: dibayar saat mengambil kartu, 1 Koin per saham sektor ini yang dimiliki (termasuk kartu ini)
  const saveFee = card.action === 'Trading Fee' ? owned + 1 : 0;
  const activateFee = saveFee;
  const targets = card.action === 'Akuisisi' ? acquisitionTargets(room, p, card.sector) : [];
  const others = room.tableCards.filter(c => c.id !== card.id);
  // Anti-buntu: jika tidak ada langkah legal sama sekali, simpan tetap diizinkan
  const anyLegal = room.tableCards.some(c => {
    const f = c.action === 'Trading Fee' ? shares(p, c.sector) + 1 : 0;
    return p.coins >= f;
  });
  const canSave = p.coins >= saveFee || !anyLegal;
  let canActivate = true, activateReason = '';
  if (card.action === 'Trading Fee' && p.coins < activateFee) { canActivate = false; activateReason = `Butuh ${activateFee} Koin untuk fee`; }
  else if (card.action === 'Quickbuy' && others.length === 0) { canActivate = false; activateReason = 'Tidak ada kartu lain di meja'; }
  else if (card.action === 'Akuisisi' && targets.length === 0) { canActivate = false; activateReason = 'Tidak ada lawan yang memenuhi syarat'; }
  return {
    saveFee, canSave, saveReason: canSave ? '' : `Butuh ${saveFee} Koin untuk fee`,
    activateFee, canActivate, activateReason, targets,
  };
}

// Opsi untuk pemain yang sedang giliran; kosong untuk yang lain.
export function options(room, uid) {
  const out = {};
  if (room.step !== 'action' || actorId(room) !== uid) return out;
  const p = findPlayer(room, uid);
  for (const c of room.tableCards) out[c.id] = evaluate(room, p, c);
  return out;
}

function endAction(room) {
  const n = room.players.length;
  room.actionIdx = (room.actionIdx + 1) % n;
  // Lewati giliran pemain yang memakai Quickbuy di ronde ini (hanya sekali)
  for (let i = 0; i < n && room.tableCards.length && ordered(room)[room.actionIdx].skipTurn; i++) {
    const skipped = ordered(room)[room.actionIdx];
    skipped.skipTurn = false;
    log(room, `${skipped.name} dilewati (efek Quickbuy).`);
    room.actionIdx = (room.actionIdx + 1) % n;
  }
  if (room.tableCards.length === 0) {
    room.step = 'sell'; room.sellIdx = 0;
    log(room, 'Fase Aksi selesai. Fase Jual dimulai.');
  }
}

export function takeCard(room, uid, a) {
  if (room.step !== 'action') throw new Error('Belum fase aksi');
  if (actorId(room) !== uid) throw new Error('Belum giliran Anda');
  const p = findPlayer(room, uid);
  const card = room.tableCards.find(c => c.id === a.cardId);
  if (!card) throw new Error('Kartu tidak ada di meja');
  const opt = evaluate(room, p, card);

  if (a.mode === 'save') {
    if (!opt.canSave) throw new Error(opt.saveReason);
    const fee = Math.min(p.coins, opt.saveFee);
    p.coins -= fee;
    removeFromTable(room, card.id);
    p.cards.push(newHolding(p, card.sector));
    log(room, `${p.name} menyimpan 1 lembar ${SHORT[card.sector]}${fee ? ` (fee ${fee} Koin)` : ''}.`);
    return endAction(room);
  }
  if (a.mode !== 'activate') throw new Error('Mode tidak dikenal');
  if (!opt.canActivate) throw new Error(opt.activateReason);

  switch (card.action) {
    case 'Quickbuy': {
      // Kartu Quickbuy ini dan 1 kartu lain dari meja menjadi milik pemain.
      // Kartu kedua tidak punya efek. Giliran pemain berikutnya di ronde ini dilewati.
      const ids = [...new Set(a.cardIds || [])];
      if (ids.length !== 1) throw new Error('Pilih tepat 1 kartu lain dari meja');
      const pick = room.tableCards.find(c => c.id === ids[0] && c.id !== card.id);
      if (!pick) throw new Error('Kartu pilihan tidak valid');
      removeFromTable(room, card.id);
      removeFromTable(room, pick.id);
      p.cards.push(newHolding(p, card.sector), newHolding(p, pick.sector));
      p.skipTurn = true;
      log(room, `${p.name} mengaktifkan Quickbuy & menyimpan ${SHORT[card.sector]} + ${SHORT[pick.sector]}. Giliran berikutnya di ronde ini hangus.`);
      break;
    }
    case 'Info Bursa': {
      const secs = [...new Set(a.sectors || [])].filter(s => room.sectorOrder.includes(s));
      if (secs.length !== 3) throw new Error('Pilih tepat 3 sektor untuk diintip');
      removeFromTable(room, card.id);
      room.discard.unshift(card);
      // Bandar yang akan mengisi intipan dari dek rahasia (lihat fulfillPeeks)
      room.peekRequests = [...(room.peekRequests || []), { uid, sectors: secs }];
      log(room, `${p.name} mengaktifkan Info Bursa (rahasia).`);
      break;
    }
    case 'Akuisisi': {
      const wantSec = card.sector === 'reksadana' ? a.targetSector : card.sector;
      const target = opt.targets.find(t => t.uid === a.targetUid && t.sector === wantSec);
      if (!target) throw new Error('Pilih target yang memenuhi syarat');
      const t = findPlayer(room, target.uid);
      const pool = t.cards.filter(c => !c.isDebt && c.sector === target.sector).sort((x, y) => x.multiplier - y.multiplier);
      const taken = pool[0];
      removeFromTable(room, card.id);
      room.discard.unshift(card);
      t.cards = t.cards.filter(c => c.id !== taken.id);
      p.cards.push(taken);
      t.coins += ACQ_BONUS;
      log(room, `${p.name} mengakuisisi 1 ${SHORT[target.sector]} dari ${t.name} (${t.name} +${ACQ_BONUS} Koin).`);
      break;
    }
    case 'Trading Fee': {
      if (a.sellSector && !ALL.includes(a.sellSector)) throw new Error('Sektor jual tidak valid');
      const fee = Math.min(p.coins, opt.activateFee);
      removeFromTable(room, card.id);
      room.discard.unshift(card);
      p.coins -= fee;
      log(room, `${p.name} mengaktifkan Trading Fee (bayar ${fee} Koin).`);
      if (a.sellSector && shares(p, a.sellSector) > 0) {
        const rev = sellCards(room, p, a.sellSector, Infinity);
        log(room, `Trading Fee: ${p.name} menjual seluruh ${SHORT[a.sellSector]} (+${rev} Koin).`);
      }
      break;
    }
    case 'Rumor': {
      // Pilihan 1: satu sektor naik 2 langkah atau turun 2 langkah.
      // Pilihan 2: dua sektor berbeda, masing-masing 1 langkah (naik atau turun).
      // Dibatasi ujung papan, jadi tidak memicu crash/split.
      const ch = Array.isArray(a.changes) ? a.changes : [];
      if (ch.some(c => !SECTORS.includes(c.sector) || ![1, -1, 2, -2].includes(c.delta))) throw new Error('Sektor atau arah Rumor tidak valid');
      const okOne = ch.length === 1 && Math.abs(ch[0].delta) === 2;
      const okTwo = ch.length === 2 && ch[0].sector !== ch[1].sector && ch.every(c => Math.abs(c.delta) === 1);
      if (!okOne && !okTwo) throw new Error('Rumor: 1 sektor 2 langkah, atau 2 sektor berbeda masing-masing 1 langkah');
      removeFromTable(room, card.id);
      room.discard.unshift(card);
      for (const c of ch) {
        const old = room.prices[c.sector];
        setPos(room, c.sector, Math.max(0, Math.min(TRACKS[c.sector].length - 1, room.pos[c.sector] + c.delta)));
        log(room, `Rumor oleh ${p.name}: harga ${SHORT[c.sector]} ${old} → ${room.prices[c.sector]}.`);
      }
      break;
    }
    default:
      throw new Error('Aksi kartu tidak dikenal');
  }
  return endAction(room);
}

function sellCards(room, p, sec, qty) {
  const price = priceOf(room, sec);
  let revenue = 0, removed = 0;
  p.cards = p.cards.filter(c => {
    if (!c.isDebt && c.sector === sec && removed < qty) { revenue += c.multiplier * price; removed++; return false; }
    return true;
  });
  p.coins += revenue;
  return revenue;
}

function advanceSell(room) {
  room.sellIdx++;
  if (room.sellIdx >= room.players.length) {
    room.step = 'economy';
    log(room, 'Fase Jual selesai. Bandar dapat membuka Fase Ekonomi.');
  }
}

export function sellSector(room, uid, a) {
  if (room.step !== 'sell') throw new Error('Belum fase jual');
  if (actorId(room) !== uid) throw new Error('Belum giliran jual Anda');
  const p = findPlayer(room, uid);
  const sec = a.sector;
  if (!ALL.includes(sec)) throw new Error('Pilih sektor');
  const have = activeCards(p, sec).length;
  if (!have) throw new Error('Anda tidak punya lembar sektor ini');
  const qty = Math.max(1, Math.min(have, Math.floor(Number(a.qty)) || have));
  const rev = sellCards(room, p, sec, qty);
  log(room, `${p.name} menjual ${qty} kartu ${SHORT[sec]} (+${rev} Koin).`);
  advanceSell(room);
}

export function holdSell(room, uid) {
  if (room.step !== 'sell') throw new Error('Belum fase jual');
  if (actorId(room) !== uid) throw new Error('Belum giliran jual Anda');
  log(room, `${findPlayer(room, uid).name} menahan seluruh sahamnya.`);
  advanceSell(room);
}

export function takeDebt(room, uid, cardId) {
  if (!['bidding', 'action', 'sell'].includes(room.step)) throw new Error('Pinjaman tidak tersedia saat ini');
  const p = findPlayer(room, uid);
  const card = p.cards.find(c => c.id === cardId && !c.isDebt);
  if (!card) throw new Error('Kartu tidak ditemukan');
  if (card.sector === 'reksadana') throw new Error('Hanya kartu saham yang bisa dibalik');
  card.isDebt = true;
  card.multiplier = 1;
  p.coins += DEBT_LOAN;
  log(room, `${p.name} membalik 1 kartu ${SHORT[card.sector]} untuk pinjaman ${DEBT_LOAN} Koin.`);
}

// ---------- hal rahasia yang diurus bandar ----------
// Mengisi intipan Info Bursa dari dek bandar. Mengembalikan { [uid]: { [sektor]: kartu } }.
export function fulfillPeeks(room, secret) {
  const out = {};
  for (const req of room.peekRequests || []) {
    out[req.uid] = {};
    for (const sec of req.sectors) {
      const top = secret.economy[sec]?.[0];
      if (top) out[req.uid][sec] = { name: top.name, delta: top.delta, purple: top.purple };
    }
  }
  room.peekRequests = [];
  return out;
}

export function revealEconomy(room, secret) {
  if (room.step !== 'economy') throw new Error('Belum waktunya membuka Fase Ekonomi');
  const revealed = {};
  const totals = Object.fromEntries(SECTORS.map(s => [s, 0]));
  for (const sec of room.sectorOrder) {
    const card = secret.economy[sec].shift();
    revealed[sec] = card;
    totals[sec] += card.delta;
  }
  const events = [];
  for (const sec of room.sectorOrder) {
    const card = revealed[sec];
    events.push(`${SHORT[sec]}: ${card.name} (${card.delta > 0 ? '+' : ''}${card.delta})`);
    if (card.purple === 'dividend') {
      for (const p of room.players) {
        const sh = shares(p, sec);
        if (sh > 0) { p.coins += sh * 2; events.push(`Dividen Khusus ${SHORT[sec]}: ${p.name} +${sh * 2} Koin`); }
      }
    } else if (card.purple === 'market_crisis') {
      room.sectorOrder.forEach(s => { totals[s] -= 1; });
      events.push('Krisis Pasar: seluruh 4 sektor -1');
    } else if (card.purple === 'center_boom') {
      totals[room.sectorOrder[1]] += 2;
      totals[room.sectorOrder[2]] += 2;
      events.push('Booming Tengah: dua sektor tengah +2');
    }
  }
  for (const sec of room.sectorOrder) {
    const next = room.pos[sec] + totals[sec];
    if (next < 0) {
      let lost = 0;
      room.players.forEach(p => {
        const sh = shares(p, sec);
        if (sh) { lost += sh; p.cards = p.cards.filter(c => c.isDebt || c.sector !== sec); }
      });
      setPos(room, sec, startPos(sec));
      events.push(`STOCK CRASH ${SHORT[sec]}! ${lost} lembar hilang, harga kembali ${START_PRICE}.`);
    } else if (next > TRACKS[sec].length - 1) {
      room.players.forEach(p => p.cards.forEach(c => { if (!c.isDebt && c.sector === sec) c.multiplier *= 2; }));
      setPos(room, sec, startPos(sec));
      events.push(`STOCK SPLIT ${SHORT[sec]}! Token Split ×2 diberikan, harga kembali ${START_PRICE}.`);
    } else {
      setPos(room, sec, next);
    }
  }
  room.lastEconomy = {
    round: room.round,
    revealed: Object.fromEntries(Object.entries(revealed).map(([s, c]) => [s, { name: c.name, delta: c.delta, purple: c.purple }])),
    events,
  };
  room.economyLeft = countEconomy(room, secret);
  room.step = 'economy_done';
  events.forEach(e => log(room, e));
}
