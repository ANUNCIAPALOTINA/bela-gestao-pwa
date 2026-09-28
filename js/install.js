// Convite para instalar o app na tela inicial (Android: botão nativo; iPhone: instruções).
import { h, icon } from './util.js';
import { isNative } from './native.js';

let deferred = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; window.dispatchEvent(new Event('install-ready')); });
window.addEventListener('appinstalled', () => { deferred = null; });

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function installCard() {
  if (isNative() || standalone() || localStorage.getItem('hide-install') === '1') return null;
  const card = h('div', { class: 'card install' });
  const draw = () => {
    if (!deferred && !ios()) return card.replaceChildren();
    card.replaceChildren(h('div', { class: 'grow' }, h('b', {}, 'Instale o app no seu celular'),
      h('div', { class: 'small muted' }, deferred ? 'Abre como um aplicativo e funciona mesmo sem internet.' : 'No Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".')),
      deferred ? h('button', { class: 'btn small primary', onclick: async () => { deferred.prompt(); await deferred.userChoice; deferred = null; draw(); } }, icon('download', 18), 'Instalar') : null,
      h('button', { class: 'icon-btn', 'aria-label': 'Dispensar', onclick: () => { localStorage.setItem('hide-install', '1'); card.remove(); } }, icon('x', 18)));
  };
  window.addEventListener('install-ready', draw, { once: true });
  draw();
  return card;
}
