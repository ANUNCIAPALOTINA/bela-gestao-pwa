// Tela principal: registrar venda em poucos toques.
import { h, icon, money, toast, sheet, confirmBox, today, addDays, fmtDate, waLink, fmtPhone, initials, r2, debounce } from '../util.js';
import * as S from '../services.js';
import { pageHeader, productSearch, stepper, moneyInput, val, field, dateInput } from '../ui.js';
import { go } from '../nav.js';
import { openClientForm } from './clients.js';
import { receiptText } from './history.js';

// O rascunho sobrevive à troca de aba (ex.: ir ver um cliente e voltar).
const fresh = () => ({ clientId: null, items: [], discount: 0, payment: 'pix', date: today(), note: '',
  cardType: 'credito', parcels: 1, fee: S.state.settings.cardFee || 0, firstDue: null });
let draft = fresh();

const numBR = n => String(Math.round(n * 10) / 10).replace('.', ',');
const marginOf = (price, cost) => (price > 0 ? ((price - cost) / price) * 100 : 0);

export function view() {
  const pre = sessionStorage.getItem('sell-client');
  if (pre) { sessionStorage.removeItem('sell-client'); if (S.state.clients.has(pre)) draft.clientId = pre; }
  const root = h('div', { class: 'page sell' });
  const clientBox = h('div'), itemsBox = h('div', { class: 'stack' }), footer = h('div', { class: 'sticky-bar' });
  const clientSec = h('section', { class: 'client-sec' }, h('h2', {}, '1. Cliente'), clientBox);

  /* --- Cliente (minimiza depois de escolhida) --- */
  function drawClient() {
    const c = S.state.clients.get(draft.clientId);
    clientSec.classList.toggle('done', !!c);
    clientBox.replaceChildren(c
      ? h('button', { class: 'client-chip', onclick: pickClient, 'aria-label': 'Trocar cliente' }, h('span', { class: 'good' }, icon('check', 20)),
        h('div', { class: 'grow' }, h('b', {}, c.name), c.phone ? h('span', { class: 'small muted' }, ' · ' + fmtPhone(c.phone)) : null), h('span', { class: 'link' }, 'Trocar'))
      : h('button', { class: 'client-pick', onclick: pickClient }, icon('users', 22), h('span', { class: 'grow' }, 'Escolher ou cadastrar a cliente'), icon('plus', 20)));
  }
  function pickClient() {
    const list = h('div', { class: 'list' });
    const q = h('input', { class: 'input big', type: 'search', placeholder: 'Buscar cliente pelo nome ou telefone', autocomplete: 'off' });
    const draw = () => {
      const res = S.searchClients(q.value).slice(0, 40);
      list.replaceChildren(...res.map(c => h('button', { class: 'row-item', onclick: () => { draft.clientId = c.id; s.close(); drawClient(); drawFooter(); } },
        h('div', { class: 'avatar' }, initials(c.name)), h('div', { class: 'ri-main' }, h('div', { class: 'ri-title' }, c.name), h('div', { class: 'ri-sub' }, fmtPhone(c.phone))))));
      if (!res.length) list.replaceChildren(h('p', { class: 'muted pad' }, q.value ? 'Ninguém com esse nome — cadastre abaixo.' : 'Você ainda não tem clientes. Cadastre a primeira!'));
    };
    q.addEventListener('input', debounce(draw, 80));
    const s = sheet('Quem está comprando?', h('div', { class: 'stack' },
      h('button', { class: 'btn primary block', onclick: () => { s.close(); openClientForm(null, c => { draft.clientId = c.id; drawClient(); drawFooter(); }); } }, icon('plus', 20), 'Cadastrar nova cliente'),
      q, list));
    draw(); setTimeout(() => q.focus(), 250);
  }

  /* --- Itens --- */
  function addProduct(p, qty) {
    const ex = draft.items.find(i => i.code === p.code);
    if (ex) {
      if (!ex.encomenda && ex.qty >= qty) return toast(`Você só tem ${qty} em estoque.`, 'err');
      ex.qty++; return drawItems();
    }
    const real = S.stockCost(p.code);
    const push = encomenda => { draft.items.push({ code: p.code, name: p.name, price: p.price, qty: 1, encomenda, cost: real || S.estCost(p.price), costEst: !real }); drawItems(); };
    if (qty > 0) return push(false);
    confirmBox('Sem estoque', `Você não tem "${p.name}" em estoque. Registrar como encomenda? O estoque não será alterado — registre a compra depois.`, { ok: 'Registrar encomenda' }).then(ok => ok && push(true));
  }
  // Atualiza só os números da linha (não recria os campos, para não atrapalhar a digitação).
  function refreshItem(it) {
    const r = it._r; if (!r) return;
    r.line.textContent = money(it.qty * it.price);
    r.profit.textContent = `Lucro nesta linha: ${money(it.qty * (it.price - it.cost))}`;
    r.profit.className = 'calc-sub ' + (it.price < it.cost ? 'bad' : '');
    totals();
  }
  function drawItems() {
    if (!draft.items.length) itemsBox.replaceChildren(h('div', { class: 'hint-box' }, icon('tag', 22), h('div', {}, h('b', {}, 'Nenhum produto ainda.'), h('div', { class: 'small muted' }, 'Toque no campo acima para ver o que você tem em estoque, ou digite o código/nome.'))));
    else itemsBox.replaceChildren(...draft.items.map(it => {
      const max = it.encomenda ? 999 : S.stockQty(it.code);
      const price = moneyInput(it.price, { 'aria-label': 'Preço final', class: 'input mini-in price-in' });
      const margin = h('input', { class: 'input mini-in', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Margem de lucro em %', value: numBR(marginOf(it.price, it.cost)) });
      const line = h('b', { class: 'line-total' }, money(it.qty * it.price));
      const profit = h('div', { class: 'calc-sub' });
      it._r = { line, profit, price, margin };
      price.addEventListener('input', () => { it.price = val(price); margin.value = numBR(marginOf(it.price, it.cost)); refreshItem(it); });
      margin.addEventListener('input', () => {
        const m = val(margin);
        if (m >= 100 || !(it.cost > 0)) return; // margem de 100% ou custo zero não tem preço possível
        it.price = r2(it.cost / (1 - m / 100));
        price.value = String(it.price).replace('.', ',');
        refreshItem(it);
      });
      const el = h('div', { class: 'item' },
        h('div', { class: 'item-top' }, h('div', { class: 'grow' }, h('div', { class: 'ri-title' }, it.name), h('div', { class: 'small muted' }, h('span', { class: 'code' }, it.code), it.encomenda ? ' · encomenda' : ` · ${max} em estoque`)),
          h('button', { class: 'icon-btn', 'aria-label': 'Remover ' + it.name, onclick: () => { draft.items = draft.items.filter(x => x !== it); drawItems(); } }, icon('x', 20))),
        h('div', { class: 'calc' },
          h('div', { class: 'calc-cell' }, h('span', { class: 'lbl-s' }, it.costEst ? 'Custo (estim.)' : 'Custo'), h('b', {}, money(it.cost))),
          h('label', { class: 'calc-cell' }, h('span', { class: 'lbl-s' }, 'Margem %'), margin),
          h('label', { class: 'calc-cell' }, h('span', { class: 'lbl-s' }, 'Preço final R$'), price)),
        profit,
        h('div', { class: 'item-bot' }, stepper(it.qty, { min: 1, max, onChange: n => { it.qty = n; refreshItem(it); } }), line));
      refreshItem(it);
      return el;
    }));
    totals(); drawFooter();
  }

  /* --- Pagamento --- */
  const PAYS = [['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['cartao', 'Cartão'], ['fiado', 'A receber']];
  const payBox = h('div', { class: 'chips' }), payExtra = h('div');
  const setPay = k => { draft.payment = k; draft.firstDue = null; if (k !== 'cartao' && k !== 'fiado') draft.parcels = 1; if (k === 'cartao') draft.fee = draft.fee || S.state.settings.cardFee || 0; drawPay(); };
  const drawPay = () => { payBox.replaceChildren(...PAYS.map(([k, l]) => h('button', { type: 'button', class: 'chip' + (draft.payment === k ? ' on' : ''), onclick: () => setPay(k) }, l))); drawPayExtra(); };
  const discount = moneyInput(draft.discount, { 'aria-label': 'Desconto' });
  discount.addEventListener('input', () => { draft.discount = val(discount); totals(); });
  const date = dateInput({ value: draft.date, max: today(), label: 'Data da venda' });
  date.addEventListener('change', () => { draft.date = date.value || today(); totals(); });

  const netTotal = () => { const st = S.saleSubtotal(draft.items); return r2(st - Math.min(draft.discount || 0, st)); };
  const effectiveFirst = () => draft.firstDue || addDays(draft.date, draft.payment === 'cartao' && draft.cardType === 'debito' ? 1 : 30);
  const plan = () => {
    const debit = draft.payment === 'cartao' && draft.cardType === 'debito';
    return S.buildInstallments(netTotal(), debit ? 1 : draft.parcels, effectiveFirst(), { fee: draft.payment === 'cartao' ? draft.fee : 0 });
  };
  let preview = null, parcelSel = null, firstIn = null;
  function drawPreview() {
    if (!preview) return;
    const list = plan(), tot = netTotal(), card = draft.payment === 'cartao';
    if (parcelSel) [...parcelSel.options].forEach((o, i) => { o.textContent = `${i + 1}x de ${money(tot / (i + 1))}`; });
    if (firstIn && firstIn.value !== effectiveFirst()) firstIn.value = effectiveFirst();
    const liquid = r2(list.reduce((t, i) => t + i.net, 0));
    preview.replaceChildren(
      h('div', { class: 'inst-list' }, list.map(i => h('div', { class: 'inst-row' },
        h('span', { class: 'n' }, list.length > 1 ? `${i.n}/${list.length}` : '1x'), h('span', { class: 'd' }, fmtDate(i.due)),
        h('span', { class: 'v' }, money(card ? i.net : i.amount))))),
      ...(card && draft.fee > 0 ? [h('div', { class: 'small muted' }, `Taxa da maquininha: ${money(tot - liquid)} · você recebe ${money(liquid)} no total (valores já com a taxa).`)] : []));
  }
  function drawPayExtra() {
    parcelSel = firstIn = null;
    const k = draft.payment;
    if (k === 'pix' || k === 'dinheiro') { preview = null; return payExtra.replaceChildren(h('div', { class: 'small muted' }, '✓ Recebido na hora.')); }
    preview = h('div', { class: 'stack-s' });
    const n = h('select', { class: 'sel', 'aria-label': 'Número de parcelas', onchange: e => { draft.parcels = +e.target.value; drawPreview(); } },
      Array.from({ length: 12 }, (_, i) => h('option', { value: i + 1, selected: draft.parcels === i + 1 }, `${i + 1}x`)));
    const first = dateInput({ value: effectiveFirst(), label: 'Data da primeira parcela' });
    first.addEventListener('change', () => { draft.firstDue = first.value || null; drawPreview(); });
    firstIn = first;
    if (k === 'cartao') {
      const debit = draft.cardType === 'debito';
      const fee = h('input', { class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', 'aria-label': 'Taxa da maquininha em %', value: draft.fee ? numBR(draft.fee) : '' });
      fee.addEventListener('input', () => { draft.fee = Math.max(0, Math.min(100, val(fee))); drawPreview(); });
      const seg = h('div', { class: 'seg' }, [['credito', 'Crédito'], ['debito', 'Débito']].map(([t, l]) =>
        h('button', { type: 'button', class: draft.cardType === t ? 'on' : '', onclick: () => { draft.cardType = t; draft.firstDue = null; if (t === 'debito') draft.parcels = 1; drawPayExtra(); } }, l)));
      parcelSel = debit ? null : n;
      payExtra.replaceChildren(h('div', { class: 'pay-box' }, seg,
        h('div', { class: 'grid2' }, debit ? null : field('Parcelas', n), field('Taxa da maquininha (%)', fee)),
        field(debit ? 'Cai na conta em' : 'Primeira parcela cai em', first, 'Débito costuma cair em 1 dia; crédito, em 30 dias.'),
        preview));
    } else {
      parcelSel = n;
      const chips = h('div', { class: 'chips' }, [[7, '7 dias'], [15, '15 dias'], [30, '30 dias']].map(([d, l]) =>
        h('button', { type: 'button', class: 'chip', onclick: () => { draft.firstDue = addDays(draft.date, d); first.value = draft.firstDue; drawPreview(); } }, l)));
      payExtra.replaceChildren(h('div', { class: 'pay-box' },
        h('div', { class: 'grid2' }, field('Parcelas', n), field('1º vencimento', first)), chips, preview));
    }
    drawPreview();
  }

  /* --- Total / finalizar --- */
  const sub = h('span', { class: 'small muted' }), tot = h('b', { class: 'total' });
  function totals() {
    const subtotal = S.saleSubtotal(draft.items);
    const disc = Math.min(draft.discount || 0, subtotal);
    const profit = r2(subtotal - disc - draft.items.reduce((t, i) => t + i.qty * i.cost, 0));
    const n = draft.items.reduce((t, i) => t + i.qty, 0);
    sub.textContent = draft.items.length ? `${n} item(ns)${disc ? ` · desc. ${money(disc)}` : ''} · lucro ${money(profit)}` : '';
    tot.textContent = money(subtotal - disc);
    drawPreview();
  }
  function drawFooter() {
    const ok = draft.clientId && draft.items.length;
    footer.replaceChildren(h('div', { class: 'grow' }, h('div', {}, sub), tot),
      h('button', { class: 'btn primary lg', disabled: !ok, onclick: finish }, icon('check', 22), 'Finalizar venda'));
    totals();
  }
  let busy = false;
  async function finish() {
    if (busy) return;
    if (!draft.clientId) return toast('Escolha a cliente.', 'err');
    busy = true;
    try {
      const d = draft;
      const sale = await S.registerSale({ clientId: d.clientId, discount: d.discount, payment: d.payment, date: d.date, note: d.note,
        items: d.items.map(({ _r, costEst, ...i }) => i), parcels: d.parcels, firstDue: d.payment === 'pix' || d.payment === 'dinheiro' ? null : effectiveFirst(), cardType: d.cardType, fee: d.fee });
      if (d.payment === 'cartao' && d.fee !== S.state.settings.cardFee) S.saveSettings({ cardFee: d.fee });
      const c = S.state.clients.get(sale.clientId);
      draft = fresh();
      done(sale, c);
    } catch (e) { toast(e.message, 'err'); } finally { busy = false; }
  }
  function done(sale, c) {
    const open = S.saleInstallments(sale).filter(i => !i.paid);
    const s = sheet('Venda registrada! 🎉', h('div', { class: 'stack center' },
      h('div', { class: 'big-total' }, money(sale.total)),
      h('p', { class: 'muted' }, `${c.name} · lucro de ${money(S.saleProfit(sale))}. O estoque já foi atualizado.`),
      open.length ? h('p', { class: 'small' }, `${S.payDetail(sale)} — ${open.length > 1 ? `${open.length} parcelas, a primeira em ` : 'recebe em '}${fmtDate(open[0].due)}.`) : null,
      c.phone ? h('a', { class: 'btn wa block', target: '_blank', rel: 'noopener', href: waLink(c.phone, receiptText(sale, c)) }, icon('chat', 20), 'Enviar recibo no WhatsApp') : null,
      h('button', { class: 'btn primary block', onclick: () => { s.close(); go('/vender'); } }, 'Registrar outra venda'),
      h('button', { class: 'btn ghost block', onclick: () => { s.close(); go('/inicio'); } }, 'Voltar ao início')),
      { onClose: () => go('/vender') });
  }

  const search = h('div', { class: 'sticky-top' }, productSearch({ onPick: addProduct, onlyStock: true, browse: true, placeholder: 'Toque para ver seu estoque ou digite o código/nome' }));
  root.append(pageHeader('Nova venda', { actions: draft.items.length || draft.clientId ? [h('button', { class: 'btn small ghost', onclick: async () => { if (await confirmBox('Limpar venda?', 'Os itens e a cliente escolhidos serão descartados.', { ok: 'Limpar', danger: true })) { draft = fresh(); go('/vender'); } } }, 'Limpar')] : [] }),
    clientSec,
    h('section', {}, h('h2', {}, '2. Produtos'), search, itemsBox),
    h('section', {}, h('h2', {}, '3. Pagamento'), payBox, payExtra,
      h('div', { class: 'grid2' }, field('Desconto (R$)', discount), field('Data da venda', date))),
    h('div', { class: 'spacer-bar' }), footer);
  drawClient(); drawPay(); drawItems();
  return root;
}
