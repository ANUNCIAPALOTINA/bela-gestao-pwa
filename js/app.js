import { h, icon, $, sheet, APP_NAME } from './util.js';
import * as S from './services.js';
import * as db from './db.js';
import { route, boot, go } from './nav.js';
import * as home from './views/home.js';
import * as sell from './views/sell.js';
import * as stock from './views/stock.js';
import * as clients from './views/clients.js';
import * as more from './views/more.js';
import * as alerts from './views/alerts.js';
import * as indicators from './views/indicators.js';
import * as reports from './views/reports.js';
import * as history from './views/history.js';
import * as purchases from './views/purchases.js';
import * as receivables from './views/receivables.js';
import * as settings from './views/settings.js';
import { isNative, initNative } from './native.js';

route('/inicio', 'inicio', home.view);
route('/vender', 'vender', sell.view);
route('/estoque', 'estoque', stock.view);
route('/clientes', 'clientes', clients.listView);
route('/cliente/:id', 'clientes', clients.detailView);
route('/mais', 'mais', more.view);
route('/avisos', 'mais', alerts.view);
route('/indicadores', 'mais', indicators.view);
route('/relatorios', 'mais', reports.view);
route('/vendas', 'mais', history.view);
route('/receber', 'mais', receivables.view);
route('/compras', 'mais', purchases.listView);
route('/compra', 'estoque', purchases.newView);
route('/config', 'mais', settings.view);

const TABS = [['inicio', 'home', 'Início', '/inicio'], ['estoque', 'box', 'Estoque', '/estoque'], ['vender', 'plus', 'Vender', '/vender'],
  ['clientes', 'users', 'Clientes', '/clientes'], ['mais', 'menu', 'Mais', '/mais']];

function buildTabs() {
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Menu principal' });
  const btns = {};
  for (const [key, ic, label, path] of TABS) {
    const b = h('button', { class: 'tab' + (key === 'vender' ? ' main' : ''), 'aria-label': label, onclick: () => go(path) },
      h('span', { class: 'tab-ico' }, icon(ic, key === 'vender' ? 28 : 24)), h('span', { class: 'tab-lbl' }, label), key === 'mais' ? h('i', { class: 'dot', hidden: true }) : null);
    btns[key] = b; nav.append(b);
  }
  nav.setActive = k => { for (const [key, b] of Object.entries(btns)) { b.classList.toggle('active', key === k); b.toggleAttribute('aria-current', key === k); } nav.refreshBadge(); };
  nav.refreshBadge = () => { const dot = btns.mais.querySelector('.dot'); const n = S.alertCount(); dot.hidden = !n; dot.textContent = n > 9 ? '9+' : n; };
  return nav;
}

async function start() {
  const view = $('#view');
  try {
    await S.load();
    if (!S.state.products.size) await S.loadBundledCatalog().catch(e => console.warn('catálogo:', e));
    db.requestPersistence();
  } catch (e) {
    console.error(e);
    view.replaceChildren(h('div', { class: 'page' }, h('h2', {}, 'Não foi possível abrir o armazenamento do app'),
      h('p', { class: 'muted' }, 'Verifique se o navegador não está em modo anônimo/privado e se há espaço livre no celular. Depois recarregue a página.')));
    return;
  }
  const tabs = buildTabs();
  $('#app').append(tabs);
  S.onChange(() => tabs.refreshBadge());
  boot(view, tabs);
  if (!S.state.settings.onboarded) welcome();
}

function welcome() {
  const name = h('input', { class: 'input big', type: 'text', placeholder: 'Como você se chama?', autocapitalize: 'words', autocomplete: 'given-name' });
  const go_ = async () => { await S.saveSettings({ name: name.value.trim(), onboarded: true }); s.close(); go('/inicio'); };
  const s = sheet(`Bem-vinda ao ${APP_NAME}! 💖`, h('form', { class: 'stack', onsubmit: e => { e.preventDefault(); go_(); } },
    h('p', { class: 'muted' }, 'Controle seu estoque, suas vendas e suas clientes em um só lugar — tudo direto no celular, mesmo sem internet.'),
    name,
    h('div', { class: 'card tip small' }, 'Seus dados ficam guardados neste aparelho. Use o backup em Configurações para não perder nada.'),
    h('button', { class: 'btn primary lg block', type: 'submit' }, 'Começar')), { onClose: () => S.saveSettings({ onboarded: true }) });
  setTimeout(() => name.focus(), 300);
}

// Enquanto a pessoa digita, esconde o menu de baixo para não disputar espaço com o teclado.
const TEXTY = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]):not([type=file]):not(.date-native), textarea';
document.addEventListener('focusin', e => { if (e.target.matches && e.target.matches(TEXTY)) document.body.classList.add('typing'); });
document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (!(a && a.matches && a.matches(TEXTY))) document.body.classList.remove('typing'); }, 60));

initNative();
// No app Android os arquivos já estão dentro do APK: o service worker só serve à versão web.
if ('serviceWorker' in navigator && !isNative()) {
  // Quando o service worker novo assume (skipWaiting + clients.claim no sw.js), a aba recarrega
  // sozinha para mostrar a versão nova — sem precisar fechar e abrir o app manualmente.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.update(); // força checar se há versão nova mesmo que o navegador ainda não tenha revalidado o sw.js
      setInterval(() => reg.update(), 60 * 60 * 1000); // reconfere de hora em hora enquanto o app fica aberto
    }).catch(() => {});
  });
}
start();
