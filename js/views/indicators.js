import { h, icon, money, pct, int, periodRange, previousRange, parseISO, toISO, addDays, diffDays, fmtDateShort, fmtDate, monthName } from '../util.js';
import * as S from '../services.js';
import { pageHeader, stat, barChart, rankList, empty } from '../ui.js';
import { go } from '../nav.js';

export const PERIODS = [['hoje', 'Hoje'], ['semana', 'Esta semana'], ['mes', 'Este mês'], ['mes_passado', 'Mês passado'], ['ano', 'Este ano']];
let period = 'mes';

export function rangeLabel(kind, range) {
  const found = PERIODS.find(p => p[0] === kind);
  return (found ? found[1] + ' · ' : '') + (range[0] === range[1] ? fmtDate(range[0]) : `${fmtDate(range[0])} a ${fmtDate(range[1])}`);
}

export function view() {
  const root = h('div', { class: 'page' });
  const body = h('div', { class: 'stack' }), chips = h('div', { class: 'chips scroll' });
  const drawChips = () => chips.replaceChildren(...PERIODS.map(([k, l]) => h('button', { class: 'chip' + (period === k ? ' on' : ''), onclick: () => { period = k; drawChips(); draw(); } }, l)));
  function draw() {
    const range = periodRange(period), m = S.metrics(range), pm = S.metrics(previousRange(range)), ov = S.overview();
    const days = [];
    const n = Math.min(diffDays(range[1], range[0]) + 1, 31);
    // gráfico: se o período for longo (ano), agrupa por mês
    if (period === 'ano') {
      for (let i = 0; i < 12; i++) { const key = `${range[0].slice(0, 4)}-${String(i + 1).padStart(2, '0')}`; let v = 0; m.byDay.forEach((val, d) => { if (d.startsWith(key)) v += val; }); days.push({ label: monthName(i).slice(0, 3), v }); }
    } else for (let i = 0; i < n; i++) { const d = addDays(range[0], i); days.push({ label: period === 'semana' ? ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'][i] : fmtDateShort(d).slice(0, 2), v: m.byDay.get(d) || 0 }); }
    const topClients = m.topClients.slice(0, 5).map(c => ({ name: (S.state.clients.get(c.id) || {}).name || '—', v: c.total }));
    body.replaceChildren(
      h('div', { class: 'muted small' }, rangeLabel(period, range)),
      h('div', { class: 'grid2' },
        stat('Vendas', money(m.revenue), { ic: 'cart', delta: pm.revenue || m.revenue ? S.compare(m.revenue, pm.revenue) : null, sub: `${m.count} venda${m.count === 1 ? '' : 's'}` }),
        stat('Lucro', money(m.profit), { ic: 'wallet', tone: m.profit < 0 ? 'bad' : 'good', delta: pm.profit || m.profit ? S.compare(m.profit, pm.profit) : null }),
        stat('Margem', pct(m.margin), { ic: 'chart', sub: 'lucro ÷ vendas' }),
        stat('Compras', money(m.bought), { ic: 'box', sub: 'investido em estoque' }),
        stat('Ticket médio', money(m.ticket), { ic: 'tag', sub: `${int(m.units)} peças vendidas` }),
        stat('Markup', pct(m.markup), { ic: 'chart', sub: 'lucro ÷ custo' })),
      h('div', { class: 'card' }, h('h3', {}, period === 'ano' ? 'Vendas por mês' : 'Vendas por dia'), m.revenue ? barChart(days) : h('p', { class: 'muted small' }, 'Sem vendas neste período.')),
      h('h2', {}, 'Como está agora'),
      h('div', { class: 'grid2' }, stat('A receber', money(ov.receivable), { ic: 'alert', tone: ov.receivable ? 'warn' : '' }), stat('Estoque (custo)', money(ov.stockValue), { ic: 'box', sub: `${int(ov.stockUnits)} peças` }),
        stat('Clientes', int(ov.clients), { ic: 'users', sub: m.newClients ? `+${m.newClients} no período` : '' })),
      h('div', { class: 'card' }, h('h3', {}, 'Mais vendidos'), rankList(m.topProducts.slice(0, 5).map(p => ({ name: p.name, v: p.qty })), v => v + ' un.')),
      h('div', { class: 'card' }, h('h3', {}, 'Mais lucrativos'), rankList(m.topByProfit.filter(p => p.profit > 0).slice(0, 5).map(p => ({ name: p.name, v: p.profit })), money)),
      h('div', { class: 'card' }, h('h3', {}, 'Melhores clientes'), rankList(topClients, money)),
      h('button', { class: 'btn primary block', onclick: () => go('/relatorios') }, icon('file', 20), 'Gerar relatório deste período'));
  }
  root.append(pageHeader('Indicadores', { back: '/mais' }), chips, body);
  drawChips(); draw();
  return root;
}
