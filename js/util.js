// Utilitários gerais: DOM, formatação, datas, CSV, ícones.

import { isNative, shareFile, shareBlob } from './native.js';

export const APP_NAME = 'Bela Gestão';

/* ---------- DOM ---------- */
// h('div', {class:'x', onclick:fn}, 'texto', outroNo) — nunca usa innerHTML, então nomes de clientes não injetam HTML.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // somente para SVG estático interno
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);

const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2.2.7 3.5 2.6 3.5 5.6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  cart: '<path d="M3 4h3l2 12h11l2-8H7"/><circle cx="10" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  gift: '<path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13"/><path d="M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-3v3M17 14h2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
};
export function icon(name, size = 22) {
  const wrap = document.createElement('span');
  wrap.className = 'ico';
  wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return wrap;
}

/* ---------- Números / moeda ---------- */
export const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = n => brl.format(r2(n));
export const pct = n => (isFinite(n) ? (Math.round(n * 10) / 10).toString().replace('.', ',') : '0') + '%';
export const int = n => new Intl.NumberFormat('pt-BR').format(Math.round(n || 0));
// aceita "12,50" / "1.234,56" / "12.5"
export function parseNum(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/[^\d,.\-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/* ---------- Texto ---------- */
export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const digits = s => String(s ?? '').replace(/\D/g, '');
export function fmtPhone(s) {
  const d = digits(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || '';
}
export function waLink(phone, text) {
  let d = digits(phone);
  if (!d) return null;
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text || '')}`;
}
export const initials = name => norm(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

/* ---------- Datas (sempre 'YYYY-MM-DD' no fuso local) ---------- */
const p2 = n => String(n).padStart(2, '0');
export const toISO = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const today = () => toISO(new Date());
export const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
// Soma meses mantendo o dia (31/01 + 1 mês = 28/02 ou 29/02).
export const addMonths = (iso, k) => {
  const d = parseISO(iso), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + k);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toISO(d);
};
export const diffDays = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 86400000); // a - b
export const fmtDate = iso => iso ? iso.split('-').reverse().join('/') : '';
export const fmtDateShort = iso => iso ? iso.slice(8) + '/' + iso.slice(5, 7) : '';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthName = i => MESES[i];
export function relDay(iso) {
  const d = diffDays(iso, today());
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d === -1) return 'ontem';
  return d > 0 ? `em ${d} dias` : `há ${-d} dias`;
}
// Períodos usados em relatórios/indicadores. Semana começa na segunda.
export function periodRange(kind, ref = today()) {
  const d = parseISO(ref);
  const y = d.getFullYear(), m = d.getMonth();
  switch (kind) {
    case 'hoje': return [ref, ref];
    case 'semana': { const off = (d.getDay() + 6) % 7; const s = addDays(ref, -off); return [s, addDays(s, 6)]; }
    case 'semana_passada': { const off = (d.getDay() + 6) % 7; const s = addDays(ref, -off - 7); return [s, addDays(s, 6)]; }
    case 'mes': return [toISO(new Date(y, m, 1)), toISO(new Date(y, m + 1, 0))];
    case 'mes_passado': return [toISO(new Date(y, m - 1, 1)), toISO(new Date(y, m, 0))];
    case 'ano': return [`${y}-01-01`, `${y}-12-31`];
    case 'tudo': return ['2000-01-01', '2999-12-31'];
    default: return [ref, ref];
  }
}
export function previousRange([a, b]) {
  const len = diffDays(b, a) + 1;
  return [addDays(a, -len), addDays(a, -1)];
}
export const inRange = (iso, [a, b]) => iso >= a && iso <= b;

/* ---------- CSV (padrão brasileiro: ; e BOM p/ abrir no Excel) ---------- */
export function toCSV(headers, rows) {
  const esc = v => {
    let s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  return '﻿' + [headers, ...rows].map(r => r.map(esc).join(';')).join('\r\n');
}
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
export async function saveFile(filename, content, mime) {
  if (isNative()) {
    try { await shareFile(filename, content); return 'shared'; }
    catch (e) { if (/cancel/i.test(String(e && (e.message || e)))) return 'cancelled'; toast('Não foi possível salvar o arquivo.', 'err'); return 'cancelled'; }
  }
  const blob = new Blob([content], { type: mime });
  const file = new File([blob], filename, { type: mime });
  // No celular, abre a folha de compartilhamento (WhatsApp, e-mail, Drive...). No computador, baixa.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

// Imagem (PNG): abre direto o compartilhar do celular para mandar no WhatsApp; no computador, baixa o arquivo.
export async function shareImage(filename, blob, title) {
  if (isNative()) {
    try { await shareBlob(filename, blob, title); return 'shared'; }
    catch (e) { if (/cancel/i.test(String(e && (e.message || e)))) return 'cancelled'; toast('Não foi possível compartilhar a imagem: ' + String((e && (e.message || e)) || '').slice(0, 120), 'err'); return 'cancelled'; }
  }
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: title || filename }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

/* ---------- Feedback: toast, folha inferior, confirmação ---------- */
export function toast(msg, kind = '') {
  const root = $('#toasts');
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, msg);
  root.append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3000);
}
// Abre uma "folha" que sobe da base da tela. body pode ser Node; devolve {close, el}.
export function sheet(title, body, { onClose } = {}) {
  const root = $('#sheets');
  const back = h('div', { class: 'sheet-back' });
  const el = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Fechar', onclick: () => close() }, icon('x'))),
    h('div', { class: 'sheet-body' }, body));
  root.append(back, el);
  requestAnimationFrame(() => { back.classList.add('in'); el.classList.add('in'); });
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    back.classList.remove('in'); el.classList.remove('in');
    setTimeout(() => { back.remove(); el.remove(); }, 220);
    onClose && onClose();
  }
  back.addEventListener('click', close);
  return { close, el };
}
export function confirmBox(title, text, { ok = 'Confirmar', danger = false } = {}) {
  return new Promise(res => {
    let done = false;
    const finish = v => { if (!done) { done = true; res(v); s.close(); } };
    const s = sheet(title, h('div', { class: 'stack' },
      h('p', { class: 'muted' }, text),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost grow', onclick: () => finish(false) }, 'Cancelar'),
        h('button', { class: 'btn grow ' + (danger ? 'danger' : 'primary'), onclick: () => finish(true) }, ok))),
      { onClose: () => { if (!done) { done = true; res(false); } } });
  });
}
export const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
