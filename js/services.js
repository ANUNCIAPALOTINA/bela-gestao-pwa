// Regras de negócio: estoque, vendas, compras, avisos de recompra e indicadores.
// Os dados ficam em memória (state) e são gravados no IndexedDB a cada operação.
import * as db from './db.js';
import { r2, norm, uid, today, addDays, addMonths, diffDays, parseISO, inRange, previousRange, digits, fmtDate, parseNum } from './util.js';

export const DEFAULTS = {
  name: '',            // nome da consultora
  business: '',        // nome que aparece nos relatórios
  costPct: 60,         // custo padrão = % do preço de venda (usado para sugerir custo)
  leadDays: 7,         // avisar N dias antes do produto acabar
  minStock: 2,         // abaixo disso aparece como "estoque baixo"
  cardFee: 0,          // taxa da maquininha (%), lembrada da última venda no cartão
  waTemplate: 'Oi {nome}! Tudo bem? 💖 Passando para avisar que o seu {produtos} deve estar acabando. Quer que eu separe um novo para você?',
  lastBackup: null,
  catalogVersion: null,
  onboarded: false,
};

export const state = {
  products: new Map(), stock: new Map(), clients: new Map(),
  sales: [], purchases: [], movements: [], reminders: new Map(),
  settings: { ...DEFAULTS }, index: new Map(),
};
const listeners = new Set();
export const onChange = fn => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach(fn => fn());

const searchText = p => norm(`${p.code} ${p.name} ${p.category || ''}`);

export async function load() {
  const [products, stock, movements, clients, sales, purchases, reminders, settings] = await Promise.all(
    ['products', 'stock', 'movements', 'clients', 'sales', 'purchases', 'reminders', 'settings'].map(db.getAll));
  state.products = new Map(products.map(p => [p.code, p]));
  state.stock = new Map(stock.map(s => [s.code, s]));
  state.movements = movements.sort((a, b) => b.ts - a.ts);
  state.clients = new Map(clients.map(c => [c.id, c]));
  state.sales = sales.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  state.purchases = purchases.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  state.reminders = new Map(reminders.map(r => [r.key, r]));
  state.settings = { ...DEFAULTS, ...Object.fromEntries(settings.map(s => [s.key, s.value])) };
  state.index = new Map(products.map(p => [p.code, searchText(p)]));
}

/* ---------- Configurações ---------- */
export async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  await db.batch(Object.entries(patch).map(([key, value]) => ({ store: 'settings', put: { key, value } })));
  emit();
}

/* ---------- Catálogo ---------- */
export const estCost = price => r2((price || 0) * state.settings.costPct / 100);

async function applyCatalog(items, source, version) {
  const ops = []; let added = 0, updated = 0;
  for (const it of items) {
    const code = String(it.code || '').trim();
    if (!code || !it.name) continue;
    const old = state.products.get(code);
    const p = {
      code, name: String(it.name).trim(), category: (it.category || '').trim(),
      price: r2(it.price), days: Math.round(Number(it.days) || 0), source,
    };
    if (old) {
      // Respeita o que a vendedora editou à mão.
      if (old.priceEdited) { p.price = old.price; p.priceEdited = true; }
      if (old.daysEdited) { p.days = old.days; p.daysEdited = true; }
      if (old.source === 'custom') { p.source = 'custom'; p.name = old.name; }
      if (!p.days) p.days = old.days || 0;
      updated++;
    } else added++;
    state.products.set(code, p); state.index.set(code, searchText(p));
    ops.push({ store: 'products', put: p });
  }
  if (version !== undefined) { state.settings.catalogVersion = version; ops.push({ store: 'settings', put: { key: 'catalogVersion', value: version } }); }
  if (ops.length) await db.batch(ops);
  emit();
  return { added, updated };
}

// Primeira abertura: carrega o catálogo que acompanha o app. Depois: só quando a vendedora pedir.
export async function loadBundledCatalog({ force = false } = {}) {
  const res = await fetch('data/catalog.json', { cache: force ? 'no-store' : 'default' });
  if (!res.ok) throw new Error('Não foi possível ler o catálogo.');
  const cat = await res.json();
  if (!force && state.settings.catalogVersion === cat.version) return { added: 0, updated: 0, version: cat.version, same: true };
  const r = await applyCatalog(cat.products, 'catalog', cat.version);
  return { ...r, version: cat.version, demo: !!cat.demo };
}

// Importa planilha CSV (colunas: codigo, nome, preco, categoria, dias)
export async function importCatalogRows(rows) {
  if (rows.length < 2) throw new Error('A planilha está vazia.');
  const head = rows[0].map(norm);
  const find = (...names) => head.findIndex(h => names.some(n => h === n || h.includes(n)));
  const ic = find('codigo', 'code', 'cod', 'sku', 'ref'), inm = find('nome', 'produto', 'descricao', 'name');
  const ip = find('preco', 'valor', 'price'), icat = find('categoria', 'linha', 'grupo'), id = find('dias', 'duracao', 'rendimento');
  if (ic < 0 || inm < 0) throw new Error('A planilha precisa ter as colunas "codigo" e "nome".');
  const items = rows.slice(1).map(r => ({
    code: r[ic], name: r[inm], price: ip >= 0 ? parseNum(r[ip]) : 0, category: icat >= 0 ? r[icat] : '', days: id >= 0 ? parseNum(r[id]) : 0,
  }));
  return applyCatalog(items, 'import');
}

export async function saveProduct(p) {
  if (!String(p.name || '').trim()) throw new Error('Informe o nome do produto.');
  const code = String(p.code || '').trim() || nextCustomCode();
  const old = state.products.get(code);
  const np = {
    ...(old || {}), code, name: p.name.trim(), category: (p.category || '').trim(), price: r2(p.price), days: Math.round(p.days || 0),
    source: old ? old.source : 'custom', priceEdited: !!old && (old.priceEdited || r2(old.price) !== r2(p.price)),
    daysEdited: !!old && (old.daysEdited || (old.days || 0) !== Math.round(p.days || 0)),
  };
  state.products.set(code, np); state.index.set(code, searchText(np));
  await db.batch([{ store: 'products', put: np }]);
  emit();
  return np;
}

export function searchProducts(q, { onlyStock = false, limit = 30 } = {}) {
  const tokens = norm(q).split(/\s+/).filter(Boolean);
  const out = [];
  for (const p of state.products.values()) {
    const qty = stockQty(p.code);
    if (onlyStock && qty <= 0) continue;
    const hay = state.index.get(p.code) || '';
    if (tokens.every(t => hay.includes(t))) {
      const c = norm(p.code), first = tokens[0] || '';
      let score = 0;
      if (first && c === first) score += 100; else if (first && c.startsWith(first)) score += 40;
      if (qty > 0) score += 20;
      if (first && norm(p.name).startsWith(first)) score += 10;
      out.push({ p, qty, score });
    }
  }
  out.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name, 'pt-BR'));
  return out.slice(0, limit);
}
export const findByCode = code => state.products.get(String(code).trim());
// Código automático para produtos que a vendedora cadastra sem código (ex.: MEU-001).
export function nextCustomCode() {
  let n = 1;
  for (const c of state.products.keys()) { const m = /^MEU-(\d+)$/.exec(c); if (m) n = Math.max(n, +m[1] + 1); }
  return 'MEU-' + String(n).padStart(3, '0');
}

/* ---------- Estoque ---------- */
export const stockQty = code => (state.stock.get(code) || {}).qty || 0;
export const stockCost = code => (state.stock.get(code) || {}).avgCost || 0;

function mv(code, type, qty, unitCost, refId, date, note = '') {
  return { id: uid(), ts: Date.now(), date, code, type, qty, unitCost: r2(unitCost), refId: refId || null, note };
}
async function commit(ops, movs, stockMap) {
  const all = [...ops];
  for (const s of stockMap.values()) all.push({ store: 'stock', put: s });
  for (const m of movs) all.push({ store: 'movements', put: m });
  await db.batch(all); // se falhar, nada foi gravado e o estado em memória não muda
  for (const s of stockMap.values()) state.stock.set(s.code, s);
  state.movements.unshift(...movs);
}
const stockDraft = () => {
  const m = new Map();
  return { m, get: code => { if (!m.has(code)) m.set(code, { ...(state.stock.get(code) || { code, qty: 0, avgCost: 0 }) }); return m.get(code); } };
};

export function stockRows() {
  const rows = [];
  for (const p of state.products.values()) {
    const s = state.stock.get(p.code);
    if (s) rows.push({ p, qty: s.qty, avgCost: s.avgCost, value: r2(s.qty * s.avgCost) });
  }
  return rows.sort((a, b) => a.p.name.localeCompare(b.p.name, 'pt-BR'));
}

export async function adjustStock(code, newQty, note) {
  const d = stockDraft(); const s = d.get(code);
  const delta = newQty - s.qty;
  if (delta === 0) return;
  s.qty = newQty;
  await commit([], [mv(code, 'ajuste', delta, s.avgCost, null, today(), note || 'Ajuste manual')], d.m);
  emit();
}

/* ---------- Compras (entrada de estoque) ---------- */
export async function registerPurchase({ date = today(), items, supplier = 'Mary Kay', note = '' }) {
  if (!items.length) throw new Error('Adicione ao menos um produto.');
  const id = uid(), d = stockDraft(), movs = [];
  const lines = items.map(it => {
    const qty = Math.round(it.qty), unitCost = r2(it.unitCost);
    if (qty <= 0) throw new Error('A quantidade precisa ser maior que zero.');
    const s = d.get(it.code);
    const total = s.qty * s.avgCost + qty * unitCost;
    s.qty += qty; s.avgCost = s.qty > 0 ? r2(total / s.qty) : unitCost; // custo médio ponderado
    movs.push(mv(it.code, 'entrada', qty, unitCost, id, date));
    return { code: it.code, name: (state.products.get(it.code) || {}).name || it.code, qty, unitCost };
  });
  const purchase = { id, ts: Date.now(), date, supplier, note, items: lines, total: r2(lines.reduce((t, l) => t + l.qty * l.unitCost, 0)) };
  await commit([{ store: 'purchases', put: purchase }], movs, d.m);
  state.purchases.unshift(purchase); state.purchases.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  emit();
  return purchase;
}
export async function cancelPurchase(id) {
  const p = state.purchases.find(x => x.id === id);
  if (!p || p.canceled) return;
  const d = stockDraft(), movs = [];
  for (const it of p.items) {
    const s = d.get(it.code);
    s.qty = Math.max(0, s.qty - it.qty);
    movs.push(mv(it.code, 'estorno', -it.qty, it.unitCost, id, today(), 'Compra cancelada'));
  }
  const np = { ...p, canceled: true };
  await commit([{ store: 'purchases', put: np }], movs, d.m);
  Object.assign(p, np); emit();
}

/* ---------- Clientes ---------- */
export async function saveClient(c) {
  if (!String(c.name || '').trim()) throw new Error('Informe o nome da cliente.');
  const old = c.id ? state.clients.get(c.id) : null;
  const nc = { ...(old || { id: uid(), created: today() }), ...c, name: c.name.trim(), phone: digits(c.phone) };
  state.clients.set(nc.id, nc);
  await db.batch([{ store: 'clients', put: nc }]);
  emit();
  return nc;
}
export const clientSales = id => state.sales.filter(s => s.clientId === id && !s.canceled);
export function clientStats(id) {
  const ss = clientSales(id);
  const total = r2(ss.reduce((t, s) => t + s.total, 0));
  // "Em aberto" = o que a cliente ainda deve (vendas a receber). Cartão é dinheiro da operadora, não da cliente.
  const open = r2(ss.filter(s => s.payment === 'fiado').reduce((t, s) => t + saleInstallments(s).filter(i => !i.paid).reduce((a, i) => a + i.amount, 0), 0));
  return { count: ss.length, total, last: ss.length ? ss[0].date : null, open };
}
export function searchClients(q) {
  const t = norm(q), dq = digits(q);
  return [...state.clients.values()].filter(c => !t || norm(c.name).includes(t) || (dq && c.phone.includes(dq)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/* ---------- Vendas ---------- */
export const saleSubtotal = items => r2(items.reduce((t, i) => t + i.qty * i.price, 0));

// Parcelas: o último valor absorve os centavos que sobram. "net" = o que cai na conta (após taxa da maquininha).
export function buildInstallments(total, n, first, { fee = 0 } = {}) {
  n = Math.max(1, Math.min(24, Math.round(n) || 1));
  const base = Math.floor((total * 100) / n) / 100;
  const out = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const amount = i === n - 1 ? r2(total - acc) : base;
    acc = r2(acc + amount);
    out.push({ n: i + 1, due: addMonths(first, i), amount, net: r2(amount * (1 - fee / 100)), paid: false, paidAt: null });
  }
  return out;
}
// Vendas antigas (sem parcelas) viram uma parcela única.
export const saleInstallments = s => s.installments || [{ n: 1, due: s.date, amount: s.total, net: s.total, paid: !!s.paid, paidAt: s.paidAt || null }];

export async function registerSale({ clientId, items, discount = 0, payment = 'pix', date = today(), note = '', parcels = 1, firstDue = null, cardType = 'credito', fee = 0 }) {
  if (!clientId || !state.clients.has(clientId)) throw new Error('Escolha a cliente da venda.');
  if (!items.length) throw new Error('Adicione ao menos um produto.');
  const id = uid(), d = stockDraft(), movs = [];
  const lines = items.map(it => {
    const qty = Math.round(it.qty);
    if (qty <= 0) throw new Error('A quantidade precisa ser maior que zero.');
    const prod = state.products.get(it.code);
    const s = d.get(it.code);
    let cost = s.avgCost || it.cost || estCost(it.price);
    if (!it.encomenda) {
      if (qty > s.qty) throw new Error(`Estoque insuficiente de "${prod ? prod.name : it.code}": você tem ${s.qty}.`);
      s.qty -= qty;
      movs.push(mv(it.code, 'saida', -qty, cost, id, date));
    }
    return { code: it.code, name: prod ? prod.name : it.name, qty, price: r2(it.price), cost: r2(cost), encomenda: !!it.encomenda };
  });
  const subtotal = saleSubtotal(lines);
  const disc = Math.min(r2(discount), subtotal);
  const total = r2(subtotal - disc);
  const feePct = payment === 'cartao' ? Math.max(0, Math.min(100, Number(fee) || 0)) : 0;
  let installments, card = null;
  if (payment === 'cartao') {
    const debit = cardType === 'debito';
    const np = debit ? 1 : Math.max(1, Math.min(12, Math.round(parcels) || 1));
    installments = buildInstallments(total, np, firstDue || addDays(date, debit ? 1 : 30), { fee: feePct });
    card = { type: debit ? 'debito' : 'credito', fee: feePct };
  } else if (payment === 'fiado') {
    installments = buildInstallments(total, parcels, firstDue || addDays(date, 30));
  } else {
    installments = [{ n: 1, due: date, amount: total, net: total, paid: true, paidAt: date }];
  }
  const allPaid = installments.every(i => i.paid);
  const sale = {
    id, ts: Date.now(), date, clientId, items: lines, subtotal, discount: disc, total,
    payment, card, installments, cardFee: card ? r2(total - installments.reduce((t, i) => t + i.net, 0)) : 0,
    paid: allPaid, paidAt: allPaid ? date : null, note, canceled: false,
  };
  await commit([{ store: 'sales', put: sale }], movs, d.m);
  state.sales.unshift(sale); state.sales.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  emit();
  return sale;
}
export async function cancelSale(id) {
  const s = state.sales.find(x => x.id === id);
  if (!s || s.canceled) return;
  const d = stockDraft(), movs = [];
  for (const it of s.items) {
    if (it.encomenda) continue;
    const st = d.get(it.code);
    const total = st.qty * st.avgCost + it.qty * it.cost;
    st.qty += it.qty; st.avgCost = r2(total / st.qty);
    movs.push(mv(it.code, 'estorno', it.qty, it.cost, id, today(), 'Venda cancelada'));
  }
  const ns = { ...s, canceled: true };
  await commit([{ store: 'sales', put: ns }], movs, d.m);
  Object.assign(s, ns); emit();
}
async function saveInstallments(s, list) {
  const allPaid = list.every(i => i.paid);
  const ns = { ...s, installments: list, paid: allPaid, paidAt: allPaid ? (list.map(i => i.paidAt).sort().pop() || today()) : null };
  await db.batch([{ store: 'sales', put: ns }]);
  Object.assign(s, ns); emit();
}
export async function markInstallment(id, n, paid = true) {
  const s = state.sales.find(x => x.id === id);
  if (!s) return;
  await saveInstallments(s, saleInstallments(s).map(i => (i.n === n ? { ...i, paid, paidAt: paid ? today() : null } : { ...i })));
}
// Marca todas as parcelas de uma vez (ou desfaz todas).
export async function markPaid(id, paid = true) {
  const s = state.sales.find(x => x.id === id);
  if (!s) return;
  await saveInstallments(s, saleInstallments(s).map(i => ({ ...i, paid, paidAt: paid ? (i.paidAt || today()) : null })));
}
export const saleCost = s => r2(s.items.reduce((t, i) => t + i.qty * i.cost, 0));
// Lucro = venda − custo dos produtos − taxa da maquininha.
export const saleProfit = s => r2(s.total - saleCost(s) - (s.cardFee || 0));

/* ---------- Contas a receber ---------- */
// Uma linha por parcela em aberto. "cartao" = a operadora repassa; "cliente" = a cliente ainda deve.
export function receivables({ clientId = null } = {}) {
  const t = today(), rows = [];
  for (const s of state.sales) {
    if (s.canceled || s.paid || (clientId && s.clientId !== clientId)) continue;
    const list = saleInstallments(s);
    for (const inst of list) {
      if (inst.paid) continue;
      const days = diffDays(inst.due, t);
      rows.push({ sale: s, client: state.clients.get(s.clientId), inst, of: list.length, kind: s.payment === 'cartao' ? 'cartao' : 'cliente', overdue: days < 0, days });
    }
  }
  return rows.sort((a, b) => a.inst.due.localeCompare(b.inst.due) || a.sale.ts - b.sale.ts);
}
export function receivableTotals(rows = receivables()) {
  const sum = list => r2(list.reduce((t, r) => t + r.inst.net, 0));
  const od = rows.filter(r => r.overdue);
  return {
    total: sum(rows), overdue: sum(od), overdueCount: od.length, count: rows.length,
    week: sum(rows.filter(r => !r.overdue && r.days <= 7)),
    card: sum(rows.filter(r => r.kind === 'cartao')), client: sum(rows.filter(r => r.kind === 'cliente')),
  };
}
export function payDetail(s) {
  const n = saleInstallments(s).length;
  if (s.payment === 'cartao') {
    if (!s.card) return 'Cartão';
    return s.card.type === 'debito' ? 'Cartão de débito' : (n > 1 ? `Cartão de crédito ${n}x` : 'Cartão de crédito à vista');
  }
  if (s.payment === 'fiado') return n > 1 ? `A receber · ${n}x` : 'A receber';
  return payLabel(s.payment);
}

/* ---------- Avisos de recompra ---------- */
// Dias de duração por unidade: usa o histórico real de recompra (mediana) quando há
// pelo menos 3 recompras observadas; senão usa a estimativa do catálogo (editável).
export function usageDays() {
  const byClientCode = new Map();
  for (const s of state.sales) {
    if (s.canceled) continue;
    for (const it of s.items) {
      const k = s.clientId + '|' + it.code;
      if (!byClientCode.has(k)) byClientCode.set(k, []);
      byClientCode.get(k).push({ date: s.date, qty: it.qty });
    }
  }
  const samples = new Map();
  for (const [k, arr] of byClientCode) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
    const code = k.split('|')[1];
    for (let i = 0; i < arr.length - 1; i++) {
      const days = diffDays(arr[i + 1].date, arr[i].date) / Math.max(1, arr[i].qty);
      if (days >= 5) { if (!samples.has(code)) samples.set(code, []); samples.get(code).push(days); }
    }
  }
  const result = new Map();
  for (const p of state.products.values()) {
    const arr = (samples.get(p.code) || []).sort((a, b) => a - b);
    if (arr.length >= 3) {
      const mid = arr.length >> 1;
      const median = arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
      result.set(p.code, { days: Math.round(median), source: 'real', n: arr.length });
    } else result.set(p.code, { days: p.days || 60, source: p.days ? 'catalogo' : 'padrao', n: arr.length });
  }
  return { byClientCode, result };
}

export function getAlerts() {
  const { byClientCode, result } = usageDays();
  const t = today(), lead = state.settings.leadDays;
  const per = new Map();
  for (const [k, arr] of byClientCode) {
    const [clientId, code] = k.split('|');
    const client = state.clients.get(clientId), prod = state.products.get(code);
    if (!client || !prod) continue;
    const last = arr.reduce((a, b) => (b.date > a.date ? b : a));
    const u = result.get(code);
    const endDate = addDays(last.date, Math.round(u.days * last.qty));
    const daysLeft = diffDays(endDate, t);
    if (daysLeft > lead || daysLeft < -120) continue;
    const rem = state.reminders.get(k);
    if (rem && rem.lastDate === last.date) {
      if (rem.forever) continue;
      if (rem.snoozeUntil && rem.snoozeUntil > t) continue;
    }
    if (!per.has(clientId)) per.set(clientId, { client, items: [] });
    per.get(clientId).items.push({ key: k, prod, last: last.date, qty: last.qty, endDate, daysLeft, usage: u });
  }
  const list = [...per.values()];
  for (const g of list) g.items.sort((a, b) => a.daysLeft - b.daysLeft);
  list.sort((a, b) => a.items[0].daysLeft - b.items[0].daysLeft);
  return list;
}
export async function dismissAlert(key, { days = 0, forever = false } = {}) {
  const [clientId, code] = key.split('|');
  const arr = state.sales.filter(s => !s.canceled && s.clientId === clientId && s.items.some(i => i.code === code));
  const lastDate = arr.length ? arr[0].date : null;
  const r = { key, lastDate, forever, snoozeUntil: days ? addDays(today(), days) : null };
  state.reminders.set(key, r);
  await db.batch([{ store: 'reminders', put: r }]);
  emit();
}
export function birthdaysSoon(days = 7) {
  const out = []; const t = today();
  for (const c of state.clients.values()) {
    if (!c.birthday) continue;
    const [, m, d] = c.birthday.split('-');
    let next = `${t.slice(0, 4)}-${m}-${d}`;
    if (next < t) next = `${+t.slice(0, 4) + 1}-${m}-${d}`;
    const left = diffDays(next, t);
    if (left <= days) out.push({ client: c, left, date: next });
  }
  return out.sort((a, b) => a.left - b.left);
}
export const lowStock = () => stockRows().filter(r => r.qty <= state.settings.minStock);
export function alertCount() { return getAlerts().length + birthdaysSoon().length; }

/* ---------- Indicadores ---------- */
export function metrics(range) {
  const sales = state.sales.filter(s => !s.canceled && inRange(s.date, range));
  const purchases = state.purchases.filter(p => !p.canceled && inRange(p.date, range));
  const revenue = r2(sales.reduce((t, s) => t + s.total, 0));
  const cost = r2(sales.reduce((t, s) => t + saleCost(s), 0));
  const fees = r2(sales.reduce((t, s) => t + (s.cardFee || 0), 0));
  const profit = r2(revenue - cost - fees);
  const bought = r2(purchases.reduce((t, p) => t + p.total, 0));
  const units = sales.reduce((t, s) => t + s.items.reduce((a, i) => a + i.qty, 0), 0);
  const byProduct = new Map(), byClient = new Map(), byDay = new Map();
  for (const s of sales) {
    byDay.set(s.date, r2((byDay.get(s.date) || 0) + s.total));
    const c = byClient.get(s.clientId) || { id: s.clientId, total: 0, count: 0 };
    c.total = r2(c.total + s.total); c.count++; byClient.set(s.clientId, c);
    for (const i of s.items) {
      const p = byProduct.get(i.code) || { code: i.code, name: i.name, qty: 0, revenue: 0, cost: 0 };
      p.qty += i.qty; p.revenue = r2(p.revenue + i.qty * i.price); p.cost = r2(p.cost + i.qty * i.cost);
      byProduct.set(i.code, p);
    }
  }
  const products = [...byProduct.values()].map(p => ({ ...p, profit: r2(p.revenue - p.cost) }));
  return {
    sales, count: sales.length, revenue, cost, fees, profit, margin: revenue ? (profit / revenue) * 100 : 0,
    markup: cost ? (profit / cost) * 100 : 0, bought, units, ticket: sales.length ? r2(revenue / sales.length) : 0,
    topProducts: products.sort((a, b) => b.qty - a.qty || b.revenue - a.revenue),
    topByProfit: [...products].sort((a, b) => b.profit - a.profit),
    topClients: [...byClient.values()].sort((a, b) => b.total - a.total), byDay,
    newClients: [...state.clients.values()].filter(c => inRange(c.created, range)).length,
  };
}
export function overview() {
  const receivable = receivableTotals().total;
  let stockValue = 0, stockUnits = 0;
  for (const s of state.stock.values()) { stockValue += s.qty * s.avgCost; stockUnits += s.qty; }
  return { receivable, stockValue: r2(stockValue), stockUnits, clients: state.clients.size };
}
export const compare = (cur, prev) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : cur ? 100 : 0);
export { previousRange };

/* ---------- Relatórios ---------- */
const PAY = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', fiado: 'A receber' };
export const payLabel = k => PAY[k] || k;

export const REPORTS = {
  vendas: 'Vendas', produtos: 'Produtos vendidos', compras: 'Compras (entradas)', estoque: 'Estoque atual', clientes: 'Clientes', receber: 'Contas a receber',
};
export function buildReport(type, range) {
  const m = metrics(range);
  switch (type) {
    case 'vendas': {
      const rows = m.sales.slice().sort((a, b) => a.date.localeCompare(b.date)).map(s => [
        fmtDate(s.date), (state.clients.get(s.clientId) || {}).name || '—', s.items.map(i => `${i.qty}x ${i.name}`).join(', '),
        payDetail(s), s.paid ? 'Pago' : 'A receber', s.total, saleProfit(s)]);
      return { headers: ['Data', 'Cliente', 'Itens', 'Pagamento', 'Situação', 'Total (R$)', 'Lucro (R$)'], rows, numeric: [5, 6],
        totals: ['', '', '', '', 'TOTAL', m.revenue, m.profit] };
    }
    case 'produtos': {
      const rows = m.topProducts.map(p => [p.code, p.name, p.qty, p.revenue, p.cost, p.profit, p.revenue ? r2((p.profit / p.revenue) * 100) : 0]);
      return { headers: ['Código', 'Produto', 'Qtd', 'Vendas (R$)', 'Custo (R$)', 'Lucro (R$)', 'Margem (%)'], rows, numeric: [2, 3, 4, 5, 6],
        totals: ['', 'TOTAL', m.units, m.revenue, m.cost, m.profit, r2(m.margin)] };
    }
    case 'compras': {
      const rows = [];
      for (const p of state.purchases.filter(x => !x.canceled && inRange(x.date, range)).sort((a, b) => a.date.localeCompare(b.date)))
        for (const i of p.items) rows.push([fmtDate(p.date), p.supplier, i.code, i.name, i.qty, i.unitCost, r2(i.qty * i.unitCost)]);
      return { headers: ['Data', 'Fornecedor', 'Código', 'Produto', 'Qtd', 'Custo unit. (R$)', 'Total (R$)'], rows, numeric: [4, 5, 6],
        totals: ['', '', '', 'TOTAL', rows.reduce((t, r) => t + r[4], 0), '', m.bought] };
    }
    case 'estoque': {
      const rows = stockRows().filter(r => r.qty > 0).map(r => [r.p.code, r.p.name, r.qty, r.avgCost, r.value, r.p.price, r.qty <= state.settings.minStock ? 'Baixo' : 'OK']);
      return { headers: ['Código', 'Produto', 'Qtd', 'Custo médio (R$)', 'Valor em estoque (R$)', 'Preço venda (R$)', 'Situação'], rows, numeric: [2, 3, 4, 5],
        totals: ['', 'TOTAL', rows.reduce((t, r) => t + r[2], 0), '', r2(rows.reduce((t, r) => t + r[4], 0)), '', ''], snapshot: true };
    }
    case 'clientes': {
      const rows = [...state.clients.values()].map(c => ({ c, st: clientStats(c.id) })).sort((a, b) => b.st.total - a.st.total)
        .map(({ c, st }) => [c.name, c.phone, st.count, st.total, st.last ? fmtDate(st.last) : '—', st.open]);
      return { headers: ['Cliente', 'Telefone', 'Compras', 'Total comprado (R$)', 'Última compra', 'Em aberto (R$)'], rows, numeric: [2, 3, 5], snapshot: true };
    }
    case 'receber': {
      const rows = receivables().map(r => [fmtDate(r.inst.due), r.client ? r.client.name : '—', payDetail(r.sale), `${r.inst.n}/${r.of}`, r.overdue ? 'Atrasada' : 'Em dia', r.inst.net]);
      return { headers: ['Vencimento', 'Cliente', 'Forma', 'Parcela', 'Situação', 'Valor líquido (R$)'], rows, numeric: [5], totals: ['', '', '', '', 'TOTAL', r2(rows.reduce((t, r) => t + r[5], 0))], snapshot: true };
    }
  }
}

/* ---------- Backup ---------- */
export async function exportBackup() {
  const data = { app: 'bela-gestao', version: 1, exportedAt: new Date().toISOString() };
  for (const s of Object.keys(db.STORES)) data[s] = await db.getAll(s);
  await saveSettings({ lastBackup: today() });
  return JSON.stringify(data);
}
export async function importBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Arquivo inválido.'); }
  if (data.app !== 'bela-gestao') throw new Error('Este arquivo não é um backup do app.');
  const ops = [];
  for (const s of Object.keys(db.STORES)) { ops.push({ store: s, clear: true }); for (const row of data[s] || []) ops.push({ store: s, put: row }); }
  await db.batch(ops);
  await load(); emit();
}
export async function eraseEverything() { await db.wipeAll(); await load(); emit(); }
export { parseISO };
