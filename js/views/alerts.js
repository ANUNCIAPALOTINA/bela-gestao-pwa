// Avisos: clientes que provavelmente estão ficando sem o produto (oportunidade de nova venda).
import { h, icon, toast, waLink, fmtPhone, initials, fmtDate, relDay, sheet } from '../util.js';
import * as S from '../services.js';
import { pageHeader, empty } from '../ui.js';
import { go, rerender } from '../nav.js';
import { productSheet } from './stock.js';

const status = d => d < 0 ? { t: `provavelmente acabou há ${-d} dia${d === -1 ? '' : 's'}`, k: 'off' } : d === 0 ? { t: 'acaba hoje', k: 'warn' } : { t: `acaba em ${d} dia${d === 1 ? '' : 's'}`, k: 'warn' };

export function message(client, items) {
  const names = items.map(i => i.prod.name);
  const lista = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1];
  return S.state.settings.waTemplate.replaceAll('{nome}', client.name.split(' ')[0]).replaceAll('{produtos}', lista).replaceAll('{produto}', lista);
}

export function alertCard(g, { compact = false } = {}) {
  const { client, items } = g;
  const wa = waLink(client.phone, message(client, items));
  const later = h('button', { class: 'btn small ghost', onclick: async () => { for (const i of items) await S.dismissAlert(i.key, { days: 15 }); toast('Ok! Aviso de volta em 15 dias.'); rerender(); } }, 'Já falei / lembrar depois');
  return h('div', { class: 'card alert-card' },
    h('div', { class: 'row gap-s' }, h('div', { class: 'avatar' }, initials(client.name)),
      h('button', { class: 'grow linkish', onclick: () => go('/cliente/' + client.id) }, h('b', {}, client.name), h('div', { class: 'small muted' }, client.phone ? fmtPhone(client.phone) : 'sem telefone'))),
    h('div', { class: 'stack-s' }, items.map(i => { const st = status(i.daysLeft); return h('div', { class: 'use-row' },
      h('div', { class: 'grow stack-s' }, h('div', { class: 'ri-title' }, i.prod.name), h('div', { class: 'small muted' }, `Comprou ${fmtDate(i.last)} · dura ~${i.usage.days}d${i.usage.source === 'real' ? ' (média real)' : ''}`),
        h('span', { class: 'badge ' + st.k, style: 'align-self:flex-start;white-space:normal' }, st.t))); })),
    compact ? null : h('div', { class: 'stack-s' },
      wa ? h('a', { class: 'btn wa block', href: wa, target: '_blank', rel: 'noopener', onclick: () => setTimeout(() => later.click(), 400) }, icon('chat', 20), 'Chamar no WhatsApp') : h('span', { class: 'muted small grow' }, 'Cadastre o telefone para chamar com um toque.'),
      later));
}

export function view() {
  const groups = S.getAlerts(), bdays = S.birthdaysSoon(14), low = S.lowStock();
  const root = h('div', { class: 'page' }, pageHeader('Avisos', { back: '/mais' }));
  root.append(h('p', { class: 'muted' }, 'Clientes que provavelmente estão ficando sem o produto — ótima hora para oferecer de novo.'));
  if (!groups.length) root.append(empty('bell', 'Tudo em dia! 🎉', S.state.sales.length ? 'Nenhuma cliente deve estar ficando sem produto agora.' : 'Quando você registrar vendas, o app calcula quando cada produto deve acabar e avisa aqui.'));
  else root.append(h('section', {}, h('h2', {}, `Hora de contatar (${groups.length})`), ...groups.map(g => alertCard(g))));
  if (bdays.length) root.append(h('section', {}, h('h2', {}, '🎂 Aniversariantes'), h('div', { class: 'card list-tight' }, bdays.map(b => {
    const wa = waLink(b.client.phone, `Parabéns, ${b.client.name.split(' ')[0]}! 🎉💖 Muita saúde e felicidade! Tenho uma surpresa especial para você.`);
    return h('div', { class: 'use-row' }, h('div', { class: 'grow' }, h('div', { class: 'ri-title' }, b.client.name), h('div', { class: 'small muted' }, `${fmtDate(b.date).slice(0, 5)} · ${relDay(b.date)}`)),
      wa ? h('a', { class: 'btn small wa', href: wa, target: '_blank', rel: 'noopener' }, icon('chat', 18), 'Parabenizar') : null);
  }))));
  if (low.length) root.append(h('section', {}, h('h2', {}, 'Estoque baixo'), h('div', { class: 'card list-tight' }, low.slice(0, 15).map(r => h('button', { class: 'use-row linkish', onclick: () => productSheet(r.p.code, rerender) },
    h('div', { class: 'grow left' }, h('div', { class: 'ri-title' }, r.p.name), h('div', { class: 'small muted' }, r.p.code)), h('span', { class: 'badge ' + (r.qty <= 0 ? 'off' : 'warn') }, r.qty <= 0 ? 'acabou' : r.qty + ' un.'))))));
  root.append(h('div', { class: 'card tip' }, icon('bell', 20), h('div', { class: 'small' }, 'Como o app calcula: ao ter 3 ou mais recompras de um produto, ele usa a duração real que suas clientes levam para acabar. Antes disso, usa a estimativa do catálogo, que você pode ajustar em cada produto.')));
  return root;
}
