import { h, icon, money, APP_NAME } from '../util.js';
import * as S from '../services.js';
import { pageHeader } from '../ui.js';
import { go } from '../nav.js';

export function view() {
  const n = S.alertCount(), rc = S.receivableTotals();
  const item = (ic, title, sub, path, badge) => h('button', { class: 'menu-item', onclick: () => go(path) },
    h('div', { class: 'menu-ico' }, icon(ic, 24)), h('div', { class: 'grow left' }, h('b', {}, title), h('div', { class: 'small muted' }, sub)),
    badge ? h('span', { class: 'count' }, badge) : icon('back', 18));
  return h('div', { class: 'page' }, pageHeader('Mais opções'),
    h('div', { class: 'menu' },
      item('bell', 'Avisos', 'Quem deve estar ficando sem produto', '/avisos', n || null),
      item('wallet', 'A receber', rc.count ? `${money(rc.total)} em ${rc.count} parcela(s)${rc.overdueCount ? ' · ' + rc.overdueCount + ' atrasada(s)' : ''}` : 'Parcelas de cartão e vendas a prazo', '/receber', rc.overdueCount || null),
      item('chart', 'Indicadores', 'Lucro, vendas, compras e margem', '/indicadores'),
      item('file', 'Relatórios', 'Semanal, mensal — mande a imagem no WhatsApp ou exporte planilha', '/relatorios'),
      item('cart', 'Histórico de vendas', 'Todas as vendas registradas', '/vendas'),
      item('box', 'Compras', 'Entradas de estoque', '/compras'),
      item('cog', 'Configurações e backup', 'Seus dados, catálogo, avisos', '/config')),
    h('p', { class: 'muted small center pad' }, APP_NAME + ' · seus dados ficam guardados neste celular.'));
}
