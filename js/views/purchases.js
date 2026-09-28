// Entrada de estoque (compras da consultora) e histórico de compras.
import { h, icon, money, fmtDate, toast, confirmBox, sheet, today } from '../util.js';
import * as S from '../services.js';
import { pageHeader, empty, field, productSearch, stepper, moneyInput, val, dateInput } from '../ui.js';
import { go, rerender } from '../nav.js';

let draft = { date: today(), supplier: 'Mary Kay', items: [] };

export function newView() {
  const pre = sessionStorage.getItem('buy-code');
  if (pre) { sessionStorage.removeItem('buy-code'); const p = S.findByCode(pre); if (p && !draft.items.some(i => i.code === pre)) draft.items.push(line(p)); }
  const root = h('div', { class: 'page sell' });
  const itemsBox = h('div'), footer = h('div', { class: 'sticky-bar' });
  const sub = h('span'), tot = h('b', { class: 'total' });

  function line(p) { return { code: p.code, name: p.name, qty: 1, unitCost: S.stockCost(p.code) || S.estCost(p.price) }; }
  function totals() {
    draft.items.forEach(i => i._line && (i._line.textContent = money(i.qty * i.unitCost)));
    sub.textContent = `${draft.items.reduce((t, i) => t + i.qty, 0)} peça(s)`;
    tot.textContent = money(draft.items.reduce((t, i) => t + i.qty * i.unitCost, 0));
  }
  function drawItems() {
    itemsBox.replaceChildren(...(draft.items.length ? draft.items.map(it => {
      const cost = moneyInput(it.unitCost, { class: 'input price-in', 'aria-label': 'Custo unitário' });
      cost.addEventListener('input', () => { it.unitCost = val(cost); totals(); });
      const l = h('b', { class: 'line-total' }, money(it.qty * it.unitCost)); it._line = l;
      return h('div', { class: 'item' },
        h('div', { class: 'item-top' }, h('div', { class: 'grow' }, h('div', { class: 'ri-title' }, it.name), h('div', { class: 'small muted' }, h('span', { class: 'code' }, it.code), ' · já tem ' + S.stockQty(it.code))),
          h('button', { class: 'icon-btn', 'aria-label': 'Remover', onclick: () => { draft.items = draft.items.filter(x => x !== it); drawItems(); } }, icon('x', 20))),
        h('div', { class: 'item-bot' }, stepper(it.qty, { min: 1, onChange: n => { it.qty = n; totals(); } }), h('div', { class: 'price-wrap' }, h('span', {}, 'custo R$'), cost), l));
    }) : [h('div', { class: 'hint-box' }, icon('box', 22), h('div', {}, h('b', {}, 'Adicione o que você comprou.'), h('div', { class: 'small muted' }, 'Busque pelo código ou nome. O custo vem sugerido — ajuste para o valor que você realmente pagou.')))]));
    footer.replaceChildren(h('div', { class: 'grow' }, sub, tot), h('button', { class: 'btn primary lg', disabled: !draft.items.length, onclick: save }, icon('check', 22), 'Salvar entrada'));
    totals();
  }
  let busy = false;
  async function save() {
    if (busy) return; busy = true;
    try {
      const p = await S.registerPurchase({ ...draft, items: draft.items.map(({ _line, ...i }) => i) });
      draft = { date: today(), supplier: 'Mary Kay', items: [] };
      toast(`Entrada registrada: ${money(p.total)}. Estoque atualizado.`, 'ok'); go('/estoque');
    } catch (e) { toast(e.message, 'err'); } finally { busy = false; }
  }
  const date = dateInput({ value: draft.date, max: today(), label: 'Data da compra' });
  date.addEventListener('change', () => (draft.date = date.value || today()));
  const supplier = h('input', { class: 'input', type: 'text', value: draft.supplier });
  supplier.addEventListener('input', () => (draft.supplier = supplier.value));
  root.append(pageHeader('Registrar compra', { back: '/estoque' }),
    h('p', { class: 'muted' }, 'Tudo que entra aqui vira estoque disponível para vender.'),
    h('div', { class: 'sticky-top' }, productSearch({ onPick: p => { const ex = draft.items.find(i => i.code === p.code); ex ? ex.qty++ : draft.items.push(line(p)); drawItems(); }, placeholder: 'Buscar produto por código ou nome', allowCreate: true })),
    itemsBox, h('div', { class: 'grid2' }, field('Data da compra', date), field('Fornecedor', supplier)), h('div', { class: 'spacer-bar' }), footer);
  drawItems();
  return root;
}

export function listView() {
  const root = h('div', { class: 'page' }, pageHeader('Compras', { back: '/mais', actions: [h('button', { class: 'btn small primary', onclick: () => go('/compra') }, icon('plus', 18), 'Nova')] }));
  const ps = S.state.purchases;
  if (!ps.length) { root.append(empty('box', 'Nenhuma compra registrada', 'Registre suas compras da Mary Kay para controlar o estoque e o lucro.', h('button', { class: 'btn primary', onclick: () => go('/compra') }, 'Registrar compra'))); return root; }
  root.append(h('div', { class: 'list' }, ps.map(p => h('button', { class: 'row-item' + (p.canceled ? ' dim' : ''), onclick: () => detail(p) },
    h('div', { class: 'ri-main' }, h('div', { class: 'ri-title' }, fmtDate(p.date) + ' · ' + p.supplier), h('div', { class: 'ri-sub' }, p.items.map(i => `${i.qty}x ${i.name}`).join(', '))),
    h('div', { class: 'ri-side' }, p.canceled ? h('span', { class: 'badge off' }, 'cancelada') : money(p.total))))));
  return root;
}
function detail(p) {
  const s = sheet('Compra de ' + fmtDate(p.date), h('div', { class: 'stack' },
    h('div', { class: 'card list-tight' }, p.items.map(i => h('div', { class: 'use-row' }, h('div', { class: 'grow' }, h('div', { class: 'ri-title' }, `${i.qty}x ${i.name}`), h('div', { class: 'small muted' }, `${i.code} · ${money(i.unitCost)} cada`)), h('b', {}, money(i.qty * i.unitCost))))),
    h('div', { class: 'row between big-total' }, h('span', {}, 'Total'), h('b', {}, money(p.total))),
    p.canceled ? h('div', { class: 'badge off' }, 'Compra cancelada') : h('button', { class: 'btn ghost danger-text block', onclick: async () => {
      if (!await confirmBox('Cancelar esta compra?', 'As peças saem do estoque (nunca abaixo de zero).', { ok: 'Cancelar compra', danger: true })) return;
      await S.cancelPurchase(p.id); toast('Compra cancelada'); s.close(); rerender();
    } }, icon('trash', 18), 'Cancelar compra')));
}
