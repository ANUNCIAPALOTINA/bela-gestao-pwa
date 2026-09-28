// Componentes de interface reutilizáveis.
import { h, icon, money, pct, int, debounce, parseNum, r2 } from './util.js';
import * as S from './services.js';

export function pageHeader(title, { back, actions } = {}) {
  return h('header', { class: 'page-head' },
    back ? h('button', { class: 'icon-btn', 'aria-label': 'Voltar', onclick: () => (typeof back === 'string' ? (location.hash = back) : history.back()) }, icon('back')) : null,
    h('h1', {}, title),
    h('div', { class: 'row gap-s' }, actions || []));
}
export const empty = (ic, title, text, action) =>
  h('div', { class: 'empty' }, h('div', { class: 'empty-ico' }, icon(ic, 34)), h('h3', {}, title), text ? h('p', { class: 'muted' }, text) : null, action || null);

export const field = (label, input, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);

export function textInput(opts = {}) {
  return h('input', { class: 'input', type: 'text', autocomplete: 'off', ...opts });
}
export function moneyInput(value, opts = {}) {
  return h('input', { class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00', value: value ? String(r2(value)).replace('.', ',') : '', ...opts });
}
export const val = el => parseNum(el.value);

// Campo de data no formato brasileiro (DD/MM/AAAA), independente do idioma do aparelho.
// O elemento devolvido expõe `.value` em ISO (AAAA-MM-DD, ou '' se vazio/incompleto) e dispara 'change'.
export function dateInput({ value = '', max = '', label = 'Data' } = {}) {
  const toBr = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
  const toIso = br => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br); if (!m) return '';
    const [, d, mo, y] = m, dt = new Date(+y, +mo - 1, +d);
    if (dt.getFullYear() !== +y || dt.getMonth() !== +mo - 1 || dt.getDate() !== +d || +y < 1900) return '';
    const iso = `${y}-${mo}-${d}`; return max && iso > max ? '' : iso;
  };
  let iso = toIso(toBr(value)) ? value : '';
  const text = h('input', { class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'dd/mm/aaaa', maxlength: 10, 'aria-label': label, value: toBr(iso) });
  const native = h('input', { type: 'date', class: 'date-native', tabindex: -1, 'aria-hidden': 'true', ...(max ? { max } : {}) });
  const wrap = h('div', { class: 'date-wrap' }, text, native,
    h('button', { type: 'button', class: 'date-btn', 'aria-label': 'Abrir calendário', onclick: () => {
      native.value = iso || '';
      try { native.showPicker(); } catch { native.focus(); native.click(); }
    } }, icon('calendar', 20)));
  const commit = next => { if (next !== iso) { iso = next; wrap.dispatchEvent(new Event('change')); } };
  text.addEventListener('input', () => {
    const d = text.value.replace(/\D/g, '').slice(0, 8);
    text.value = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    const next = toIso(text.value);
    text.classList.toggle('bad', d.length === 8 && !next);
    commit(d.length === 0 ? '' : next);
  });
  text.addEventListener('blur', () => { if (text.value && !iso) text.value = toBr(iso); text.classList.remove('bad'); });
  native.addEventListener('change', e => { e.stopPropagation(); text.value = toBr(native.value); text.classList.remove('bad'); commit(native.value); });
  Object.defineProperty(wrap, 'value', { get: () => iso, set: v => { iso = toIso(toBr(v)) ? v : ''; text.value = toBr(iso); } });
  wrap.focus = () => text.focus();
  return wrap;
}

export function stat(label, value, { sub, delta, tone = '', ic, onclick } = {}) {
  return h(onclick ? 'button' : 'div', { class: 'stat ' + tone + (onclick ? ' tap' : ''), ...(onclick ? { type: 'button', onclick } : {}) },
    h('div', { class: 'stat-top' }, ic ? icon(ic, 18) : null, h('span', {}, label)),
    h('div', { class: 'stat-val' }, value),
    delta != null ? h('div', { class: 'delta ' + (delta >= 0 ? 'up' : 'down') }, (delta >= 0 ? '▲ ' : '▼ ') + pct(Math.abs(delta)) + ' vs. período anterior') : null,
    sub ? h('div', { class: 'stat-sub' }, sub) : null);
}

export function stepper(value, { min = 1, max = 9999, onChange } = {}) {
  let v = value;
  const out = h('span', { class: 'step-val' }, String(v));
  const set = n => { v = Math.max(min, Math.min(max, n)); out.textContent = v; onChange && onChange(v); };
  return h('div', { class: 'stepper' },
    h('button', { type: 'button', 'aria-label': 'Diminuir', onclick: () => set(v - 1) }, '−'), out,
    h('button', { type: 'button', 'aria-label': 'Aumentar', onclick: () => set(v + 1) }, '+'));
}

// Busca de produto por código OU nome, com sugestões que mostram o código.
//  browse: ao tocar no campo (vazio) mostra a lista de produtos em estoque.
//  allowCreate: oferece "Cadastrar produto novo" quando o item não está no catálogo.
export function productSearch({ onPick, onlyStock = false, placeholder = 'Digite o código ou o nome do produto', autofocus = false, browse = false, allowCreate = false }) {
  const list = h('div', { class: 'suggest', role: 'listbox' });
  const input = h('input', { class: 'input big', type: 'search', placeholder, autocomplete: 'off', autocapitalize: 'off', enterkeyhint: 'search', 'aria-label': 'Buscar produto' });
  let only = onlyStock, opened = false, quiet = false;
  const toggle = h('button', { type: 'button', class: 'chip-toggle', onclick: () => { only = !only; sync(); run(); } });
  const sync = () => { toggle.textContent = only ? 'Mostrando só o que tenho em estoque · ver tudo' : 'Mostrando todo o catálogo · só estoque'; toggle.classList.toggle('on', only); };
  const close = () => { opened = false; list.replaceChildren(); };
  const pick = (r, fromBrowse) => {
    input.value = ''; close(); onPick(r.p, r.qty);
    if (fromBrowse) input.blur(); else { quiet = true; input.focus(); quiet = false; }
  };
  const createBtn = q => h('button', { type: 'button', class: 'suggest-item create', onclick: async () => {
    const { newProductSheet } = await import('./views/stock.js');
    const isCode = /\d/.test(q) && !/\s/.test(q);
    newProductSheet(np => { input.value = ''; close(); onPick(np, S.stockQty(np.code)); }, isCode ? { code: q } : { name: q });
  } }, h('div', { class: 'si-main' }, h('div', { class: 'si-name' }, icon('plus', 18), ' Cadastrar produto novo'),
    h('div', { class: 'si-sub' }, q ? `"${q}" não está no catálogo? Cadastre agora.` : 'Item que não está no catálogo')));
  const row = (r, fromBrowse) => h('button', { type: 'button', class: 'suggest-item', role: 'option', onclick: () => pick(r, fromBrowse) },
    h('div', { class: 'si-main' }, h('div', { class: 'si-name' }, r.p.name), h('div', { class: 'si-sub' }, h('span', { class: 'code' }, r.p.code), r.p.category ? ' · ' + r.p.category : '')),
    h('div', { class: 'si-side' }, h('div', { class: 'si-price' }, money(r.p.price)), h('div', { class: 'badge ' + (r.qty > 0 ? 'ok' : 'off') }, r.qty > 0 ? `${r.qty} em estoque` : 'sem estoque')));
  const run = () => {
    const q = input.value.trim();
    list.replaceChildren();
    if (!q) {
      if (!browse || !opened) return;
      const res = S.searchProducts('', { onlyStock: only, limit: 40 });
      list.append(h('div', { class: 'suggest-head' }, h('b', {}, only ? 'Em estoque' : 'Catálogo'), h('button', { type: 'button', class: 'link', onclick: close }, 'Fechar')));
      if (!res.length) list.append(h('div', { class: 'suggest-empty' }, only ? 'Você ainda não tem produtos em estoque. Registre uma compra primeiro.' : 'Nenhum produto cadastrado.'));
      else for (const r of res) list.append(row(r, true));
      if (allowCreate) list.append(createBtn(''));
      return;
    }
    const res = S.searchProducts(q, { onlyStock: only });
    if (!res.length) {
      list.append(h('div', { class: 'suggest-empty' }, only ? 'Nenhum produto em estoque com esse nome ou código.' : 'Nenhum produto encontrado.',
        only ? h('button', { type: 'button', class: 'link', onclick: () => { only = false; sync(); run(); } }, 'Buscar em todo o catálogo') : null));
      if (allowCreate) list.append(createBtn(q));
      return;
    }
    for (const r of res) list.append(row(r, false));
    if (allowCreate) list.append(createBtn(q));
  };
  const open = () => { if (browse && !quiet && !input.value.trim() && !opened) { opened = true; run(); } };
  input.addEventListener('focus', open);
  input.addEventListener('click', open);
  input.addEventListener('input', debounce(run, 90));
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = input.value.trim();
    const exact = S.findByCode(q) || S.findByCode(q.toUpperCase());
    if (exact) return pick({ p: exact, qty: S.stockQty(exact.code) });
    const res = S.searchProducts(q, { onlyStock: only });
    if (res.length) pick(res[0]);
  });
  sync();
  const root = h('div', { class: 'psearch' }, h('div', { class: 'search-wrap' }, icon('search', 20), input), toggle, list);
  if (autofocus) setTimeout(() => input.focus(), 60);
  return root;
}

// Gráfico de barras simples (SVG), sem bibliotecas — funciona offline.
export function barChart(days, { height = 130 } = {}) {
  const max = Math.max(1, ...days.map(d => d.v));
  const w = 320, pad = 6, bw = Math.max(4, (w - pad * 2) / days.length - 4);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${height + 22}`); svg.setAttribute('class', 'bars'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Gráfico de vendas por dia');
  days.forEach((d, i) => {
    const bh = Math.max(d.v ? 3 : 1, (d.v / max) * height);
    const x = pad + i * ((w - pad * 2) / days.length) + 2;
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', height - bh); r.setAttribute('width', bw); r.setAttribute('height', bh); r.setAttribute('rx', 3);
    r.setAttribute('class', d.v ? 'bar' : 'bar zero');
    const t = document.createElementNS(NS, 'title'); t.textContent = `${d.label}: ${money(d.v)}`; r.append(t);
    svg.append(r);
    if (days.length <= 12 || i % Math.ceil(days.length / 8) === 0) {
      const tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', x + bw / 2); tx.setAttribute('y', height + 15); tx.setAttribute('text-anchor', 'middle'); tx.textContent = d.label; svg.append(tx);
    }
  });
  return svg;
}

export function rankList(rows, fmt) {
  if (!rows.length) return h('p', { class: 'muted small' }, 'Ainda sem dados neste período.');
  const max = Math.max(...rows.map(r => r.v), 1);
  return h('div', { class: 'rank' }, rows.map((r, i) => h('div', { class: 'rank-row' },
    h('div', { class: 'rank-n' }, i + 1),
    h('div', { class: 'rank-main' }, h('div', { class: 'rank-name' }, r.name), h('div', { class: 'meter' }, h('i', { style: `width:${Math.max(4, (r.v / max) * 100)}%` }))),
    h('div', { class: 'rank-val' }, fmt(r.v)))));
}
export { money, pct, int };
