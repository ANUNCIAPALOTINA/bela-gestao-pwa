import { h, icon, money, fmtDate, toast, sheet, confirmBox, waLink, relDay, today } from '../util.js';
import * as S from '../services.js';
import { pageHeader, empty } from '../ui.js';
import { go, rerender } from '../nav.js';

export function saleSheet(sale, onChange) {
  const s = sheet('Detalhes da venda', h('div'));
  const holder = s.el.querySelector('.sheet-body');
  const draw = () => holder.replaceChildren(content());
  function content() {
    const c = S.state.clients.get(sale.clientId);
    const insts = S.saleInstallments(sale);
    const card = sale.payment === 'cartao';
    const toggle = async (i, paid) => { await S.markInstallment(sale.id, i.n, paid); toast(paid ? 'Parcela recebida' : 'Parcela desfeita', 'ok'); draw(); onChange && onChange(); };
    return h('div', { class: 'stack' },
      h('div', { class: 'muted' }, `${fmtDate(sale.date)} · ${c ? c.name : '—'} · ${S.payDetail(sale)}`),
      h('div', { class: 'card list-tight' }, sale.items.map(i => h('div', { class: 'use-row' },
        h('div', { class: 'grow' }, h('div', { class: 'ri-title' }, `${i.qty}x ${i.name}`), h('div', { class: 'small muted' }, `${i.code}${i.encomenda ? ' · encomenda' : ''}`)),
        h('b', {}, money(i.qty * i.price))))),
      sale.discount ? h('div', { class: 'row between' }, h('span', { class: 'muted' }, 'Desconto'), h('span', {}, '− ' + money(sale.discount))) : null,
      h('div', { class: 'row between big-total' }, h('span', {}, 'Total'), h('b', {}, money(sale.total))),
      sale.cardFee ? h('div', { class: 'row between small muted' }, h('span', {}, `Taxa da maquininha (${sale.card.fee}%)`), h('span', {}, '− ' + money(sale.cardFee))) : null,
      h('div', { class: 'row between small muted' }, h('span', {}, 'Lucro desta venda'), h('span', {}, money(S.saleProfit(sale)))),
      // Parcelas: quando cada uma cai / foi recebida
      !sale.canceled && (insts.length > 1 || !insts[0].paid || card) ? h('div', { class: 'stack-s' }, h('h3', {}, card ? 'Quando você recebe' : 'Parcelas'),
        h('div', { class: 'inst-list' }, insts.map(i => h('div', { class: 'inst-row' + (i.paid ? ' paid' : '') },
          h('span', { class: 'n' }, insts.length > 1 ? `${i.n}/${insts.length}` : '1x'),
          h('span', { class: 'd' }, fmtDate(i.due), h('div', { class: 'small muted' }, i.paid ? 'recebida em ' + fmtDate(i.paidAt) : (i.due < today() ? 'atrasada · ' : '') + relDay(i.due))),
          h('span', { class: 'v' }, money(card ? i.net : i.amount)),
          h('button', { class: 'btn small ' + (i.paid ? 'ghost' : 'primary'), onclick: () => toggle(i, !i.paid) }, i.paid ? 'Desfazer' : 'Recebi'))))) : null,
      sale.canceled ? h('div', { class: 'badge off' }, 'Venda cancelada — produtos devolvidos ao estoque') : h('div', { class: 'stack' },
        !sale.paid && insts.filter(i => !i.paid).length > 1 ? h('button', { class: 'btn primary block', onclick: async () => { await S.markPaid(sale.id, true); toast('Tudo recebido', 'ok'); draw(); onChange && onChange(); } }, icon('check', 20), 'Receber tudo') : null,
        sale.paid ? h('div', { class: 'badge ok' }, 'Pago em ' + fmtDate(sale.paidAt)) : null,
        c && c.phone ? h('a', { class: 'btn wa block', target: '_blank', rel: 'noopener', href: waLink(c.phone, receiptText(sale, c)) }, icon('chat', 20), 'Enviar recibo no WhatsApp') : null,
        h('button', { class: 'btn ghost danger-text block', onclick: async () => {
          if (!await confirmBox('Cancelar esta venda?', 'Os produtos voltam para o estoque e a venda deixa de contar nos indicadores.', { ok: 'Cancelar venda', danger: true })) return;
          await S.cancelSale(sale.id); toast('Venda cancelada'); s.close(); onChange && onChange();
        } }, icon('trash', 18), 'Cancelar venda')));
  }
  draw();
}
export function receiptText(sale, c) {
  const nome = S.state.settings.business || S.state.settings.name || 'sua consultora';
  const open = S.saleInstallments(sale).filter(i => !i.paid);
  const plan = sale.payment === 'fiado' && open.length
    ? '\n\nCombinado:\n' + open.map(i => `${open.length > 1 || i.n > 1 ? `Parcela ${i.n}: ` : 'Vencimento: '}${money(i.amount)} em ${fmtDate(i.due)}`).join('\n') : '';
  return `Oi ${c.name.split(' ')[0]}! Obrigada pela compra 💖\n\n` + sale.items.map(i => `${i.qty}x ${i.name} — ${money(i.qty * i.price)}`).join('\n') +
    (sale.discount ? `\nDesconto: −${money(sale.discount)}` : '') + `\n\nTotal: ${money(sale.total)}${sale.paid ? ' (pago)' : ''}${plan}\n\n— ${nome}`;
}

// Etiqueta de situação de pagamento para listas.
export const payBadge = s => (s.canceled ? h('span', { class: 'badge off' }, 'cancelada')
  : s.paid ? null : h('div', { class: 'badge warn' }, s.payment === 'cartao' ? 'cartão a receber' : 'a receber'));

export function view() {
  const root = h('div', { class: 'page' }, pageHeader('Vendas', { back: '/mais', actions: [h('button', { class: 'btn small primary', onclick: () => go('/vender') }, icon('plus', 18), 'Nova')] }));
  const sales = S.state.sales;
  if (!sales.length) return (root.append(empty('cart', 'Nenhuma venda ainda', 'Registre sua primeira venda para ver o histórico aqui.', h('button', { class: 'btn primary', onclick: () => go('/vender') }, 'Registrar venda'))), root);
  const list = h('div', { class: 'list' });
  let lastMonth = '';
  for (const s of sales) {
    const m = s.date.slice(0, 7);
    if (m !== lastMonth) { lastMonth = m; list.append(h('div', { class: 'list-sep' }, fmtDate(m + '-01').slice(3))); }
    const c = S.state.clients.get(s.clientId);
    list.append(h('button', { class: 'row-item' + (s.canceled ? ' dim' : ''), onclick: () => saleSheet(s, rerender) },
      h('div', { class: 'ri-main' }, h('div', { class: 'ri-title' }, c ? c.name : '—'), h('div', { class: 'ri-sub' }, `${fmtDate(s.date)} · ${s.items.map(i => `${i.qty}x ${i.name}`).join(', ')}`)),
      h('div', { class: 'ri-side' }, s.canceled ? h('span', { class: 'badge off' }, 'cancelada') : money(s.total), !s.canceled && !s.paid ? payBadge(s) : null)));
  }
  root.append(list);
  return root;
}
