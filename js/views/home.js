import { h, icon, money, periodRange, today, diffDays, monthName, parseISO } from '../util.js';
import * as S from '../services.js';
import { stat } from '../ui.js';
import { go, rerender } from '../nav.js';
import { alertCard } from './alerts.js';
import { receivableRow } from './receivables.js';
import { installCard } from '../install.js';

export function view() {
  const st = S.state.settings, t = new Date();
  const greet = t.getHours() < 12 ? 'Bom dia' : t.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const first = (st.name || '').split(' ')[0];
  const day = S.metrics(periodRange('hoje')), mon = S.metrics(periodRange('mes')), ov = S.overview();
  const recRows = S.receivables(), rc = S.receivableTotals(recRows);
  const groups = S.getAlerts(), low = S.lowStock().length;
  const needBackup = S.state.sales.length > 0 && (!st.lastBackup || diffDays(today(), st.lastBackup) >= 14);
  const empty = !S.state.sales.length && !S.stockRows().length;

  return h('div', { class: 'page' },
    h('header', { class: 'hello' }, h('div', {}, h('div', { class: 'muted' }, greet + (first ? ',' : '')), h('h1', {}, first ? first + ' 💖' : 'Bem-vinda 💖')),
      h('button', { class: 'icon-btn', 'aria-label': 'Configurações', onclick: () => go('/config') }, icon('cog'))),
    installCard(),
    empty ? h('div', { class: 'card start' }, h('h2', {}, 'Vamos começar em 3 passos'),
      h('ol', { class: 'steps' },
        h('li', {}, h('b', {}, 'Registre o que você comprou'), h('div', { class: 'small muted' }, 'Assim o produto aparece na hora de vender.'), h('button', { class: 'btn small primary', onclick: () => go('/compra') }, 'Registrar compra')),
        h('li', {}, h('b', {}, 'Registre sua primeira venda'), h('div', { class: 'small muted' }, 'A cliente é salva automaticamente e o estoque baixa sozinho.'), h('button', { class: 'btn small', onclick: () => go('/vender') }, 'Nova venda')),
        h('li', {}, h('b', {}, 'Acompanhe os avisos'), h('div', { class: 'small muted' }, 'O app avisa quando é hora de oferecer o produto de novo.')))) : null,
    h('button', { class: 'btn primary lg block', onclick: () => go('/vender') }, icon('cart', 24), 'Registrar venda'),
    h('div', { class: 'grid2' }, stat('Vendas hoje', money(day.revenue), { ic: 'cart', sub: `${day.count} venda${day.count === 1 ? '' : 's'}` }),
      stat('Lucro no mês', money(mon.profit), { ic: 'wallet', tone: mon.profit < 0 ? 'bad' : 'good', sub: `vendas: ${money(mon.revenue)}` })),
    h('div', { class: 'grid2' },
      stat('A receber', money(rc.total), { ic: 'alert', tone: rc.overdueCount ? 'bad' : rc.total ? 'warn' : '', onclick: () => go('/receber'),
        sub: rc.overdueCount ? `${rc.overdueCount} atrasada(s) · ${money(rc.overdue)}` : rc.count ? `${rc.count} parcela(s) · toque para ver` : 'nada pendente' }),
      stat('Estoque (custo)', money(ov.stockValue), { ic: 'box', sub: low ? `${low} item(ns) acabando` : `${ov.stockUnits} peças`, onclick: () => go('/estoque') })),
    recRows.length ? h('section', {}, h('div', { class: 'row between' }, h('h2', {}, '💰 A receber'), h('button', { class: 'link', onclick: () => go('/receber') }, 'Ver tudo')),
      ...recRows.slice(0, 3).map(r => receivableRow(r)), recRows.length > 3 ? h('button', { class: 'btn ghost block', onclick: () => go('/receber') }, `Ver mais ${recRows.length - 3} parcela(s)`) : null) : null,
    groups.length ? h('section', {}, h('div', { class: 'row between' }, h('h2', {}, `🔔 Contatar hoje (${groups.length})`), h('button', { class: 'link', onclick: () => go('/avisos') }, 'Ver todos')),
      ...groups.slice(0, 2).map(g => alertCard(g)), groups.length > 2 ? h('button', { class: 'btn ghost block', onclick: () => go('/avisos') }, `Ver mais ${groups.length - 2} cliente(s)`) : null) : null,
    needBackup ? h('div', { class: 'card warn-card' }, h('b', {}, 'Faça um backup dos seus dados'), h('p', { class: 'small muted' }, 'Seus dados ficam só neste celular. Se ele for perdido ou trocado, um backup evita começar do zero.'),
      h('button', { class: 'btn small', onclick: () => go('/config') }, icon('save', 18), 'Fazer backup agora')) : null,
    h('div', { class: 'grid2 quick' },
      h('button', { class: 'tile', onclick: () => go('/indicadores') }, icon('chart', 26), 'Indicadores'),
      h('button', { class: 'tile', onclick: () => go('/relatorios') }, icon('file', 26), 'Relatórios')));
}
