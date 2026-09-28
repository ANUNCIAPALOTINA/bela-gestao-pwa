// Contas a receber: parcelas de cartão (a operadora repassa) e de clientes (fiado).
import { h, icon, money, fmtDate, toast, relDay, waLink, monthName, r2 } from '../util.js';
import * as S from '../services.js';
import { pageHeader, empty, stat } from '../ui.js';
import { go, rerender } from '../nav.js';
import { saleSheet } from './history.js';

export function chargeText(r) {
  const nome = S.state.settings.business || S.state.settings.name || 'sua consultora';
  const first = r.client ? r.client.name.split(' ')[0] : '';
  const parte = r.of > 1 ? `a parcela ${r.inst.n}/${r.of} ` : 'o valor ';
  return `Oi ${first}! Tudo bem? 💖\n\nPassando para lembrar de ${parte}da sua compra (${r.sale.items.map(i => `${i.qty}x ${i.name}`).join(', ')}): ${money(r.inst.amount)}, com vencimento em ${fmtDate(r.inst.due)}.\n\nQualquer dúvida é só me chamar!\n— ${nome}`;
}

const badge = r => (r.overdue ? h('span', { class: 'badge bad' }, `atrasada ${-r.days}d`)
  : r.days === 0 ? h('span', { class: 'badge warn' }, 'vence hoje')
    : r.days <= 7 ? h('span', { class: 'badge warn' }, relDay(r.inst.due))
      : h('span', { class: 'badge' }, relDay(r.inst.due)));

// Uma parcela a receber, com ações rápidas.
export function receivableRow(r, { onChange, hideClient = false } = {}) {
  const done = onChange || (() => rerender());
  const card = r.kind === 'cartao';
  const value = card ? r.inst.net : r.inst.amount;
  const wa = !card && r.client && r.client.phone ? waLink(r.client.phone, chargeText(r)) : null;
  return h('div', { class: 'recv' + (r.overdue ? ' late' : '') },
    h('button', { class: 'recv-main', type: 'button', onclick: () => saleSheet(r.sale, done) },
      h('div', { class: 'ri-main' },
        hideClient ? null : h('div', { class: 'ri-title' }, r.client ? r.client.name : '—'),
        h('div', { class: hideClient ? 'ri-title' : 'ri-sub' }, S.payDetail(r.sale) + (r.of > 1 ? ` · parcela ${r.inst.n}/${r.of}` : '')),
        h('div', { class: 'ri-sub' }, `${fmtDate(r.inst.due)} `, badge(r))),
      h('div', { class: 'ri-side' }, h('b', {}, money(value)), card && r.inst.net !== r.inst.amount ? h('div', { class: 'small muted' }, 'líquido') : null)),
    h('div', { class: 'recv-actions' },
      h('button', { class: 'btn small primary grow', type: 'button', onclick: async () => { await S.markInstallment(r.sale.id, r.inst.n, true); toast('Recebido: ' + money(value), 'ok'); done(); } }, icon('check', 18), 'Recebi'),
      wa ? h('a', { class: 'btn small wa grow', href: wa, target: '_blank', rel: 'noopener' }, icon('chat', 18), 'Cobrar') : null));
}

let filter = 'todas';

export function view() {
  const pre = sessionStorage.getItem('recv-filter');
  if (pre) { sessionStorage.removeItem('recv-filter'); filter = pre; }
  const all = S.receivables(), tot = S.receivableTotals(all);
  const root = h('div', { class: 'page' }, pageHeader('A receber', { back: '/mais' }));
  if (!all.length) {
    root.append(empty('wallet', 'Nada a receber', 'Vendas no cartão parcelado e vendas "a receber" aparecem aqui, com a data de cada parcela.',
      h('button', { class: 'btn primary', onclick: () => go('/vender') }, 'Registrar venda')));
    return root;
  }
  root.append(
    h('div', { class: 'grid2' },
      stat('Total a receber', money(tot.total), { ic: 'wallet', tone: 'warn', sub: `próximos 7 dias: ${money(tot.week)}` }),
      stat('Atrasado', money(tot.overdue), { ic: 'alert', tone: tot.overdue ? 'bad' : '', sub: tot.overdueCount ? `${tot.overdueCount} parcela(s)` : 'tudo em dia' })),
    h('div', { class: 'grid2' },
      stat('No cartão', money(tot.card), { sub: 'a operadora repassa' }),
      stat('De clientes', money(tot.client), { sub: 'ainda devem a você' })));
  const chips = h('div', { class: 'chips scroll' });
  const list = h('div', { class: 'stack' });
  const FILTERS = [['todas', 'Todas'], ['atrasadas', 'Atrasadas'], ['cartao', 'Cartão'], ['clientes', 'Clientes']];
  const draw = () => {
    chips.replaceChildren(...FILTERS.map(([k, l]) => h('button', { class: 'chip' + (filter === k ? ' on' : ''), type: 'button', onclick: () => { filter = k; draw(); } }, l)));
    const rows = all.filter(r => filter === 'todas' || (filter === 'atrasadas' ? r.overdue : filter === 'cartao' ? r.kind === 'cartao' : r.kind === 'cliente'));
    if (!rows.length) return list.replaceChildren(empty('check', 'Nada por aqui', 'Nenhuma parcela neste filtro.'));
    const late = rows.filter(r => r.overdue), rest = rows.filter(r => !r.overdue);
    const out = [];
    const sum = l => money(r2(l.reduce((t, r) => t + r.inst.net, 0)));
    if (late.length) out.push(h('section', { class: 'stack-s' }, h('div', { class: 'month-head' }, h('span', {}, '⚠️ Atrasadas'), h('span', {}, sum(late))), ...late.map(r => receivableRow(r))));
    const months = new Map();
    for (const r of rest) { const k = r.inst.due.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k).push(r); }
    for (const [k, rs] of months) {
      const [y, m] = k.split('-').map(Number);
      out.push(h('section', { class: 'stack-s' }, h('div', { class: 'month-head' }, h('span', {}, `${monthName(m - 1)} de ${y}`), h('span', {}, sum(rs))), ...rs.map(r => receivableRow(r))));
    }
    list.replaceChildren(...out);
  };
  draw();
  root.append(chips, list);
  return root;
}
