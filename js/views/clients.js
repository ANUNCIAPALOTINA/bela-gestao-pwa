import { h, icon, money, fmtDate, fmtPhone, waLink, initials, toast, sheet, confirmBox, relDay, today, diffDays, addDays } from '../util.js';
import * as S from '../services.js';
import { pageHeader, empty, field, textInput, stat, dateInput } from '../ui.js';
import { go, rerender } from '../nav.js';
import { saleSheet, payBadge } from './history.js';
import { receivableRow } from './receivables.js';

// Formulário de cliente (usado no cadastro rápido durante a venda e na tela de clientes).
export function clientForm(client, onSaved, close) {
  const name = textInput({ value: client ? client.name : '', placeholder: 'Nome da cliente', autocapitalize: 'words' });
  const phone = textInput({ value: client ? client.phone : '', placeholder: '(00) 00000-0000', inputmode: 'tel', type: 'tel' });
  const birthday = dateInput({ value: client ? client.birthday || '' : '', label: 'Aniversário' });
  const notes = h('textarea', { class: 'input', rows: 2, placeholder: 'Tipo de pele, preferências, alergias...' }, client ? client.notes || '' : '');
  const save = async () => {
    try {
      const c = await S.saveClient({ ...(client || {}), name: name.value, phone: phone.value, birthday: birthday.value || '', notes: notes.value.trim() });
      toast(client ? 'Cliente atualizada' : 'Cliente salva', 'ok');
      close && close(); onSaved && onSaved(c);
    } catch (e) { toast(e.message, 'err'); name.focus(); }
  };
  return h('form', { class: 'stack', onsubmit: e => { e.preventDefault(); save(); } },
    field('Nome *', name), field('Telefone / WhatsApp', phone, 'Usado para enviar avisos de recompra com um toque.'),
    field('Aniversário', birthday), field('Observações', notes),
    h('button', { class: 'btn primary block', type: 'submit' }, client ? 'Salvar alterações' : 'Salvar cliente'));
}
export function openClientForm(client, onSaved) {
  const s = sheet(client ? 'Editar cliente' : 'Nova cliente', h('div'));
  s.el.querySelector('.sheet-body').replaceChildren(clientForm(client, onSaved, s.close));
  setTimeout(() => s.el.querySelector('input')?.focus(), 250);
}

export function clientRow(c, onclick) {
  const st = S.clientStats(c.id);
  return h('button', { class: 'row-item', onclick },
    h('div', { class: 'avatar' }, initials(c.name)),
    h('div', { class: 'ri-main' }, h('div', { class: 'ri-title' }, c.name),
      h('div', { class: 'ri-sub' }, st.count ? `${st.count} compra${st.count > 1 ? 's' : ''} · última ${relDay(st.last)}` : c.phone ? fmtPhone(c.phone) : 'Sem compras ainda')),
    h('div', { class: 'ri-side' }, st.count ? money(st.total) : '', st.open ? h('div', { class: 'badge warn' }, 'deve ' + money(st.open)) : null));
}

export function listView() {
  const root = h('div', { class: 'page' });
  const list = h('div', { class: 'list' });
  const search = h('input', { class: 'input big', type: 'search', placeholder: 'Buscar por nome ou telefone', autocomplete: 'off', 'aria-label': 'Buscar cliente' });
  const draw = () => {
    const res = S.searchClients(search.value);
    if (!res.length) list.replaceChildren(S.state.clients.size ? empty('search', 'Ninguém encontrada', 'Confira o nome ou o telefone.')
      : empty('users', 'Nenhuma cliente ainda', 'As clientes são salvas automaticamente quando você registra uma venda. Você também pode cadastrar agora.',
        h('button', { class: 'btn primary', onclick: () => openClientForm(null, c => go('/cliente/' + c.id)) }, 'Cadastrar cliente')));
    else list.replaceChildren(...res.map(c => clientRow(c, () => go('/cliente/' + c.id))));
  };
  search.addEventListener('input', draw);
  const owed = S.receivables().filter(r => r.kind === 'cliente');
  const owedClients = new Set(owed.map(r => r.sale.clientId)).size;
  const owedTotal = money(owed.reduce((t, r) => t + r.inst.amount, 0));
  const late = owed.filter(r => r.overdue).length;
  root.append(pageHeader('Clientes', { actions: [h('button', { class: 'btn small primary', onclick: () => openClientForm(null, c => go('/cliente/' + c.id)) }, icon('plus', 18), 'Nova')] }),
    ...(owed.length ? [h('button', { class: 'banner', type: 'button', onclick: () => { sessionStorage.setItem('recv-filter', 'clientes'); go('/receber'); } },
      icon('wallet', 24), h('div', { class: 'grow' }, h('b', {}, `A receber de clientes: ${owedTotal}`),
        h('div', { class: 'small muted' }, `${owedClients} cliente${owedClients > 1 ? 's' : ''}${late ? ` · ${late} parcela(s) atrasada(s)` : ''}`)), h('span', { class: 'link' }, 'Ver'))] : []),
    h('div', { class: 'sticky-top' }, h('div', { class: 'search-wrap' }, icon('search', 20), search)), list);
  draw();
  return root;
}

export function detailView({ id }) {
  const c = S.state.clients.get(id);
  if (!c) return empty('users', 'Cliente não encontrada', null, h('button', { class: 'btn', onclick: () => go('/clientes') }, 'Ver clientes'));
  const st = S.clientStats(id), sales = S.clientSales(id);
  const owed = S.receivables({ clientId: id }).filter(r => r.kind === 'cliente');
  const { byClientCode, result } = S.usageDays();
  const uses = [];
  for (const [k, arr] of byClientCode) {
    const [cid, code] = k.split('|');
    if (cid !== id) continue;
    const last = arr.reduce((a, b) => (b.date > a.date ? b : a));
    const u = result.get(code), prod = S.state.products.get(code);
    if (!prod) continue;
    uses.push({ prod, last, end: addDays(last.date, Math.round(u.days * last.qty)), u });
  }
  uses.sort((a, b) => a.end.localeCompare(b.end));
  const msg = S.state.settings.name ? `Oi ${c.name.split(' ')[0]}! Tudo bem? 💖` : `Oi ${c.name.split(' ')[0]}!`;
  const wa = waLink(c.phone, msg);
  return h('div', { class: 'page' },
    pageHeader(c.name, { back: '/clientes', actions: [h('button', { class: 'icon-btn', 'aria-label': 'Editar', onclick: () => openClientForm(c, () => rerender()) }, icon('edit'))] }),
    h('div', { class: 'card client-head' },
      h('div', { class: 'avatar lg' }, initials(c.name)),
      h('div', { class: 'grow' }, h('div', { class: 'muted' }, c.phone ? fmtPhone(c.phone) : 'Sem telefone'),
        c.birthday ? h('div', { class: 'muted small' }, '🎂 ' + fmtDate(c.birthday).slice(0, 5)) : null, c.notes ? h('div', { class: 'small note' }, c.notes) : null)),
    h('div', { class: 'row gap' },
      wa ? h('a', { class: 'btn wa grow', href: wa, target: '_blank', rel: 'noopener' }, icon('chat', 20), 'WhatsApp') : null,
      c.phone ? h('a', { class: 'btn ghost grow', href: 'tel:' + c.phone }, icon('phone', 20), 'Ligar') : null),
    h('button', { class: 'btn primary block', onclick: () => { sessionStorage.setItem('sell-client', id); go('/vender'); } }, icon('cart', 20), 'Nova venda para ' + c.name.split(' ')[0]),
    h('div', { class: 'grid2' }, stat('Total comprado', money(st.total)), stat('Compras', String(st.count), { sub: st.last ? 'Última: ' + fmtDate(st.last) : '' })),
    owed.length ? h('section', {}, h('h2', {}, `A receber · ${money(st.open)}`),
      ...owed.map(r => receivableRow(r, { hideClient: true }))) : null,
    uses.length ? h('section', {}, h('h2', {}, 'Produtos que ela usa'),
      h('div', { class: 'card list-tight' }, uses.map(u => {
        const left = diffDays(u.end, today());
        return h('div', { class: 'use-row' }, h('div', { class: 'grow' }, h('div', { class: 'ri-title' }, u.prod.name),
          h('div', { class: 'small muted' }, `Comprou ${fmtDate(u.last.date)} · dura ~${u.u.days} dias${u.u.source === 'real' ? ' (média real)' : ''}`)),
          h('span', { class: 'badge ' + (left < 0 ? 'off' : left <= S.state.settings.leadDays ? 'warn' : 'ok') }, left < 0 ? 'acabou' : left === 0 ? 'acaba hoje' : `acaba em ${left}d`));
      }))) : null,
    h('section', {}, h('h2', {}, 'Histórico de compras'),
      sales.length ? h('div', { class: 'list' }, sales.map(s => h('button', { class: 'row-item', onclick: () => saleSheet(s, () => rerender()) },
        h('div', { class: 'ri-main' }, h('div', { class: 'ri-title' }, fmtDate(s.date)), h('div', { class: 'ri-sub' }, s.items.map(i => `${i.qty}x ${i.name}`).join(', '))),
        h('div', { class: 'ri-side' }, money(s.total), payBadge(s)))))
        : h('p', { class: 'muted' }, 'Nenhuma compra registrada.')),
    h('button', { class: 'btn ghost danger-text block', onclick: async () => {
      if (sales.length) return toast('Esta cliente tem histórico de compras e não pode ser excluída.', 'err');
      if (await confirmBox('Excluir cliente?', `${c.name} será removida.`, { ok: 'Excluir', danger: true })) { S.state.clients.delete(id); const db = await import('../db.js'); await db.batch([{ store: 'clients', del: id }]); toast('Cliente excluída'); go('/clientes'); }
    } }, icon('trash', 18), 'Excluir cliente'));
}
