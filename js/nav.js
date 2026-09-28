// Roteador mínimo baseado em #hash — funciona offline e com o botão "voltar" do celular.
const routes = [];
let mount = null, tabsEl = null;

export function route(pattern, tab, render) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ rx, keys, tab, render });
}
export const go = path => { if (location.hash === '#' + path) rerender(); else location.hash = '#' + path; };
export function boot(viewEl, tabs) { mount = viewEl; tabsEl = tabs; window.addEventListener('hashchange', rerender); rerender(); }

let seq = 0;
export async function rerender() {
  const path = location.hash.replace(/^#/, '') || '/inicio';
  const my = ++seq;
  for (const r of routes) {
    const m = path.match(r.rx);
    if (!m) continue;
    const params = {}; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    const scroll = mount.scrollTop;
    let node;
    try { node = await r.render(params); }
    catch (e) { console.error(e); node = Object.assign(document.createElement('p'), { className: 'muted pad', textContent: 'Algo deu errado ao abrir esta tela. Volte e tente de novo.' }); }
    if (my !== seq) return; // outra navegação aconteceu enquanto carregava
    mount.replaceChildren(node);
    mount.dataset.view = path;
    mount.scrollTop = mount.dataset.last === path ? scroll : 0;
    mount.dataset.last = path;
    tabsEl && tabsEl.setActive(r.tab);
    return;
  }
  location.replace('#/inicio');
}
