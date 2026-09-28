// Relatórios exportáveis: planilha (CSV, abre no Excel/Google Planilhas) e PDF (impressão do navegador/celular).
import { h, icon, money, pct, int, periodRange, fmtDate, toCSV, saveFile, shareImage, toast, today } from '../util.js';
import { reportPng } from '../reportimg.js';
import * as S from '../services.js';
import { pageHeader, dateInput } from '../ui.js';

const RANGES = [['semana', 'Esta semana'], ['semana_passada', 'Semana passada'], ['mes', 'Este mês'], ['mes_passado', 'Mês passado'], ['ano', 'Este ano'], ['custom', 'Escolher datas']];
let type = 'vendas', rangeKind = 'mes', custom = [today(), today()];

export function view() {
  const root = h('div', { class: 'page' });
  const out = h('div'), customBox = h('div', { class: 'grid2' });
  const typeSel = h('select', { class: 'input', 'aria-label': 'Tipo de relatório', onchange: () => { type = typeSel.value; draw(); } },
    Object.entries(S.REPORTS).map(([k, l]) => h('option', { value: k, selected: k === type }, l)));
  const chips = h('div', { class: 'chips scroll' });
  const from = dateInput({ value: custom[0], label: 'De' }), to = dateInput({ value: custom[1], label: 'Até' });
  from.addEventListener('change', () => { custom[0] = from.value; draw(); }); to.addEventListener('change', () => { custom[1] = to.value; draw(); });
  const drawChips = () => { chips.replaceChildren(...RANGES.map(([k, l]) => h('button', { class: 'chip' + (rangeKind === k ? ' on' : ''), onclick: () => { rangeKind = k; drawChips(); draw(); } }, l))); customBox.style.display = rangeKind === 'custom' ? '' : 'none'; };
  // colunas com (R$) ou (%) ficam com 2 casas; as demais (quantidades) são inteiras
  const fmt = (v, head) => typeof v !== 'number' ? v : /\((R\$|%)\)/.test(head) ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : int(v);

  function draw() {
    const range = rangeKind === 'custom' ? [custom[0] <= custom[1] ? custom[0] : custom[1], custom[0] <= custom[1] ? custom[1] : custom[0]] : periodRange(rangeKind);
    const rep = S.buildReport(type, range), m = S.metrics(range);
    const title = S.REPORTS[type], periodTxt = rep.snapshot ? `Posição em ${fmtDate(today())}` : `${fmtDate(range[0])} a ${fmtDate(range[1])}`;
    const owner = S.state.settings.business || S.state.settings.name || '';
    const fname = `${title.toLowerCase().replaceAll(' ', '-').normalize('NFD').replace(/[̀-ͯ()]/g, '')}_${rep.snapshot ? today() : range[0] + '_a_' + range[1]}`;
    const table = h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, rep.headers.map((t, i) => h('th', { class: rep.numeric.includes(i) ? 'num' : '' }, t)))),
      h('tbody', {}, rep.rows.map(r => h('tr', {}, r.map((v, i) => h('td', { class: rep.numeric.includes(i) ? 'num' : '' }, fmt(v, rep.headers[i])))))),
      rep.totals ? h('tfoot', {}, h('tr', {}, rep.totals.map((v, i) => h('td', { class: rep.numeric.includes(i) ? 'num' : '' }, fmt(v, rep.headers[i]))))) : null));
    const summary = !rep.snapshot && (type === 'vendas' || type === 'produtos') ? h('div', { class: 'grid3 sum' },
      h('div', {}, h('span', {}, 'Vendas'), h('b', {}, money(m.revenue))), h('div', {}, h('span', {}, 'Lucro'), h('b', {}, money(m.profit))), h('div', {}, h('span', {}, 'Margem'), h('b', {}, pct(m.margin)))) : null;
    out.replaceChildren(
      h('div', { class: 'stack no-print' },
        h('button', { class: 'btn primary lg block', disabled: !rep.rows.length, onclick: async e => {
          const btn = e.currentTarget; btn.disabled = true;
          try {
            const png = await reportPng({ type, rep, metrics: m, title, periodTxt, owner });
            const r = await shareImage(fname + '.png', png, `${title} — ${periodTxt}`);
            if (r === 'downloaded') toast('Imagem salva', 'ok');
          } catch (err) { toast(err.message || 'Não foi possível gerar a imagem.', 'err'); } finally { btn.disabled = false; }
        } }, icon('share', 22), 'Compartilhar imagem (WhatsApp)'),
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn grow', disabled: !rep.rows.length, onclick: async () => {
            const r = await saveFile(fname + '.csv', toCSV(rep.headers, [...rep.rows, ...(rep.totals ? [rep.totals] : [])]), 'text/csv;charset=utf-8');
            if (r === 'downloaded') toast('Planilha baixada', 'ok'); } }, icon('download', 20), 'Planilha'),
          h('button', { class: 'btn grow', disabled: !rep.rows.length, onclick: () => { document.title = fname; window.print(); } }, icon('file', 20), 'PDF / imprimir'))),
      h('article', { class: 'report-sheet' },
        h('div', { class: 'report-head' }, h('div', {}, h('h2', {}, title), h('div', { class: 'muted' }, periodTxt), owner ? h('div', { class: 'muted small' }, owner) : null), h('div', { class: 'muted small' }, 'Gerado em ' + fmtDate(today()))),
        summary, rep.rows.length ? table : h('p', { class: 'muted pad' }, 'Nenhum registro neste período.'),
        h('p', { class: 'muted small foot' }, `${rep.rows.length} registro(s)`)));
  }
  root.append(pageHeader('Relatórios', { back: '/mais' }), h('div', { class: 'no-print stack' }, h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Relatório'), typeSel), chips, customBox), out);
  customBox.append(h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'De'), from), h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Até'), to));
  drawChips(); draw();
  return root;
}
