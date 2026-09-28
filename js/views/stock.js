import { h, icon, money, int, fmtDate, toast, sheet, debounce } from '../util.js';
import * as S from '../services.js';
import { pageHeader, empty, field, textInput, moneyInput, val, stat } from '../ui.js';
import { go, rerender } from '../nav.js';

let tab = 'estoque', filter = 'todos';

// prefill: { code, name } — usado ao cadastrar direto da busca (compra/venda).
export function productForm(p, onSaved, close, prefill = {}) {
  const code = textInput({ value: p ? p.code : (prefill.code || ''), placeholder: p ? '' : 'Deixe em branco para gerar automático', disabled: !!p, autocapitalize: 'characters' });
  const name = textInput({ value: p ? p.name : (prefill.name || ''), placeholder: 'Nome do produto' });
  const cat = textInput({ value: p ? p.category : '', placeholder: 'Ex.: Cuidados com a pele' });
  const price = moneyInput(p ? p.price : 0);
  const days = textInput({ value: p && p.days ? p.days : '', inputmode: 'numeric', placeholder: 'Ex.: 60' });
  return h('form', { class: 'stack', onsubmit: async e => {
    e.preventDefault();
    try { const np = await S.saveProduct({ code: code.value, name: name.value, category: cat.value, price: val(price), days: +days.value || 0 }); toast('Produto salvo', 'ok'); close && close(); onSaved && onSaved(np); }
    catch (err) { toast(err.message, 'err'); }
  } }, field('Nome *', name), field('Código', code, p ? null : 'Se o produto tem código de referência, digite. Senão o app cria um (MEU-001…).'),
  field('Categoria', cat), field('Preço de venda (R$)', price),
  field('Quanto tempo dura (dias)', days, 'Estimativa usada nos avisos de recompra. O app aprende com suas vendas reais.'),
  h('button', { class: 'btn primary block', type: 'submit' }, 'Salvar produto'));
}

// Abre a folha "Novo produto" (para itens que não estão no catálogo).
export function newProductSheet(onSaved, prefill) {
  const f = sheet('Novo produto', h('div'));
  f.el.querySelector('.sheet-body').replaceChildren(productForm(null, onSaved, f.close, prefill));
}

export function productSheet(code, onChange) {
  const p = S.state.products.get(code); if (!p) return;
  const qty = S.stockQty(code), cost = S.stockCost(code);
  const u = S.usageDays().result.get(code);
  const moves = S.state.movements.filter(m => m.code === code).slice(0, 8);
  const label = { entrada: 'Entrada', saida: 'Venda', ajuste: 'Ajuste', estorno: 'Estorno' };
  const adj = h('input', { class: 'input', type: 'text', inputmode: 'numeric', value: qty, 'aria-label': 'Nova quantidade' });
  const body = h('div', { class: 'stack' },
    h('div', { class: 'muted small' }, h('span', { class: 'code' }, p.code), p.category ? ' · ' + p.category : ''),
    h('div', { class: 'grid2' }, stat('Em estoque', String(qty), { tone: qty <= 0 ? 'bad' : qty <= S.state.settings.minStock ? 'warn' : '' }), stat('Preço de venda', money(p.price))),
    h('div', { class: 'grid2' }, stat('Custo médio', cost ? money(cost) : '—'), stat('Margem', cost && p.price ? int(((p.price - cost) / p.price) * 100) + '%' : '—')),
    h('div', { class: 'small muted' }, `Duração estimada: ~${u.days} dias${u.source === 'real' ? ` (calculada de ${u.n} recompras suas)` : u.source === 'catalogo' ? ' (estimativa do catálogo)' : ' (padrão)'}.`),
    h('button', { class: 'btn primary block', onclick: () => { sessionStorage.setItem('buy-code', code); s.close(); go('/compra'); } }, icon('plus', 20), 'Dar entrada (comprei este produto)'),
    h('div', { class: 'row gap' }, h('button', { class: 'btn ghost grow', onclick: () => { s.close(); const f = sheet('Editar produto', h('div')); f.el.querySelector('.sheet-body').replaceChildren(productForm(p, () => { onChange && onChange(); }, f.close)); } }, icon('edit', 18), 'Editar')),
    h('div', { class: 'card stack' }, h('b', {}, 'Corrigir quantidade (contagem)'),
      h('div', { class: 'row gap' }, adj, h('button', { class: 'btn', onclick: async () => {
        const n = parseInt(adj.value, 10); if (!(n >= 0)) return toast('Informe uma quantidade válida.', 'err');
        await S.adjustStock(code, n, 'Contagem de estoque'); toast('Quantidade atualizada', 'ok'); s.close(); onChange && onChange();
      } }, 'Salvar'))),
    moves.length ? h('div', {}, h('h3', {}, 'Últimas movimentações'), h('div', { class: 'list-tight card' }, moves.map(m => h('div', { class: 'use-row' },
      h('div', { class: 'grow' }, h('div', { class: 'ri-title' }, label[m.type] || m.type), h('div', { class: 'small muted' }, fmtDate(m.date) + (m.note ? ' · ' + m.note : ''))),
      h('b', { class: m.qty > 0 ? 'pos' : 'neg' }, (m.qty > 0 ? '+' : '') + m.qty))))) : null);
  const s = sheet(p.name, body);
}

export function view() {
  const root = h('div', { class: 'page' });
  const list = h('div', { class: 'list' });
  const q = h('input', { class: 'input big', type: 'search', placeholder: 'Buscar por nome ou código', autocomplete: 'off', 'aria-label': 'Buscar produto' });
  const tabs = h('div', { class: 'seg' }), chips = h('div', { class: 'chips' }), summary = h('div');

  const inStock = () => S.stockRows().filter(r => r.qty > 0);
  const outStock = () => S.stockRows().filter(r => r.qty <= 0);
  const drawTabs = () => tabs.replaceChildren(...[['estoque', `Em estoque (${inStock().length})`], ['sem', `Sem estoque (${outStock().length})`], ['catalogo', 'Catálogo']].map(([k, l]) =>
    h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; drawTabs(); drawChips(); draw(); } }, l)));
  const drawChips = () => {
    chips.replaceChildren(...(tab === 'estoque' ? [['todos', 'Todos'], ['baixo', 'Estoque baixo']] : []).map(([k, l]) =>
      h('button', { class: 'chip' + (filter === k ? ' on' : ''), onclick: () => { filter = k; drawChips(); draw(); } }, l)));
  };
  function row(p, qty, sub, extra) {
    return h('div', { class: 'row-item-wrap' },
      h('button', { class: 'row-item', onclick: () => productSheet(p.code, rerender) },
        h('div', { class: 'ri-main' }, h('div', { class: 'ri-title' }, p.name), h('div', { class: 'ri-sub' }, h('span', { class: 'code' }, p.code), sub ? ' · ' + sub : '')),
        h('div', { class: 'ri-side' }, h('span', { class: 'badge ' + (qty <= 0 ? 'off' : qty <= S.state.settings.minStock ? 'warn' : 'ok') }, qty <= 0 ? 'sem estoque' : qty + ' un.'), h('div', { class: 'small muted' }, money(p.price)))),
      extra || null);
  }
  const restock = p => h('button', { class: 'btn small ghost restock', onclick: () => { sessionStorage.setItem('buy-code', p.code); go('/compra'); } }, icon('plus', 16), 'Repor');
  function draw() {
    const term = q.value.trim();
    const ov = S.overview();
    summary.replaceChildren(...(tab === 'estoque' ? [h('div', { class: 'grid2' }, stat('Peças em estoque', int(ov.stockUnits), { ic: 'box' }), stat('Valor (custo)', money(ov.stockValue), { ic: 'wallet' }))] : []));
    if (tab === 'estoque' || tab === 'sem') {
      let rows = tab === 'estoque' ? inStock() : outStock();
      if (term) { const ids = new Set(S.searchProducts(term, { limit: 500 }).map(r => r.p.code)); rows = rows.filter(r => ids.has(r.p.code)); }
      if (tab === 'estoque' && filter === 'baixo') rows = rows.filter(r => r.qty <= S.state.settings.minStock);
      if (!rows.length) {
        if (tab === 'sem') return list.replaceChildren(empty('box', 'Nenhum produto acabou', 'Quando um produto zerar, ele aparece aqui para você repor.'));
        return list.replaceChildren(inStock().length ? empty('search', 'Nada por aqui', 'Tente outro filtro ou outra busca.')
          : empty('box', 'Seu estoque está vazio', 'Registre o que você comprou da Mary Kay. Depois disso, esses produtos aparecem na hora de vender.',
            h('button', { class: 'btn primary', onclick: () => go('/compra') }, icon('plus', 20), 'Registrar compra')));
      }
      list.replaceChildren(...rows.map(r => row(r.p, r.qty, r.qty > 0 ? `custo ${money(r.avgCost)}` : 'acabou', tab === 'sem' ? restock(r.p) : null)));
    } else {
      const res = term ? S.searchProducts(term, { limit: 60 }) : [...S.state.products.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).slice(0, 60).map(p => ({ p, qty: S.stockQty(p.code) }));
      if (!res.length) return list.replaceChildren(empty('search', 'Produto não encontrado', 'Cadastre-o manualmente.', h('button', { class: 'btn', onclick: () => newProduct() }, 'Cadastrar produto')));
      list.replaceChildren(...res.map(r => row(r.p, r.qty, r.p.category)), ...(!term && S.state.products.size > 60 ? [h('p', { class: 'muted small pad' }, `Mostrando 60 de ${S.state.products.size}. Use a busca para achar os outros.`)] : []));
    }
  }
  function newProduct() { newProductSheet(() => rerender(), { name: q.value.trim() }); }
  q.addEventListener('input', debounce(draw, 100));
  root.append(pageHeader('Estoque', { actions: [
    h('button', { class: 'btn small primary', onclick: () => go('/compra') }, icon('plus', 18), 'Entrada')] }),
    h('div', { class: 'sticky-top' }, tabs, h('div', { class: 'search-wrap' }, icon('search', 20), q)), summary, chips, list,
    h('button', { class: 'btn ghost block', onclick: newProduct }, icon('plus', 18), 'Cadastrar produto que não está no catálogo'));
  drawTabs(); drawChips(); draw();
  return root;
}
