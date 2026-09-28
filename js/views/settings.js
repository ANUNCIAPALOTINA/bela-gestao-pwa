import { h, icon, toast, confirmBox, saveFile, parseCSV, fmtDate, today, toCSV, APP_NAME } from '../util.js';
import * as S from '../services.js';
import { pageHeader, field, textInput, val } from '../ui.js';
import { go } from '../nav.js';

export function view() {
  const st = S.state.settings;
  const name = textInput({ value: st.name, placeholder: 'Seu nome', autocapitalize: 'words' });
  const biz = textInput({ value: st.business, placeholder: 'Ex.: Maria Consultora de Beleza' });
  const cost = textInput({ value: st.costPct, inputmode: 'numeric' });
  const lead = textInput({ value: st.leadDays, inputmode: 'numeric' });
  const min = textInput({ value: st.minStock, inputmode: 'numeric' });
  const tpl = h('textarea', { class: 'input', rows: 4 }, st.waTemplate);
  const num = (el, d, lo, hi) => { const n = parseInt(el.value, 10); return n >= lo && n <= hi ? n : d; };

  const save = async e => {
    e.preventDefault();
    await S.saveSettings({ name: name.value.trim(), business: biz.value.trim(), costPct: num(cost, 60, 1, 100), leadDays: num(lead, 7, 0, 60), minStock: num(min, 2, 0, 99), waTemplate: tpl.value.trim() || S.DEFAULTS.waTemplate });
    toast('Configurações salvas', 'ok');
  };

  const fileIn = accept => h('input', { type: 'file', accept, hidden: true });
  const backupIn = fileIn('.json,application/json'), csvIn = fileIn('.csv,text/csv,text/plain');
  backupIn.addEventListener('change', async () => {
    const f = backupIn.files[0]; if (!f) return;
    if (!await confirmBox('Restaurar backup?', 'Isto SUBSTITUI todos os dados atuais pelos do arquivo.', { ok: 'Restaurar', danger: true })) return;
    try { await S.importBackup(await f.text()); toast('Backup restaurado!', 'ok'); go('/inicio'); } catch (err) { toast(err.message, 'err'); }
    backupIn.value = '';
  });
  csvIn.addEventListener('change', async () => {
    const f = csvIn.files[0]; if (!f) return;
    try { const r = await S.importCatalogRows(parseCSV(await f.text())); toast(`Catálogo importado: ${r.added} novos, ${r.updated} atualizados`, 'ok'); } catch (err) { toast(err.message, 'err'); }
    csvIn.value = '';
  });

  const catStatus = h('div', { class: 'small muted' }, `${S.state.products.size} produtos no catálogo.`);
  return h('div', { class: 'page' }, pageHeader('Configurações', { back: '/mais' }),
    h('form', { class: 'stack', onsubmit: save },
      h('h2', {}, 'Seu perfil'), field('Seu nome', name), field('Nome nos relatórios', biz),
      h('h2', {}, 'Regras do app'),
      field('Custo padrão (% do preço de venda)', cost, 'Só sugere o custo ao registrar compras. Você sempre pode digitar o valor real.'),
      field('Avisar quantos dias antes do produto acabar', lead), field('Considerar estoque baixo quando restar até', min, 'unidades'),
      field('Mensagem do WhatsApp para recompra', tpl, 'Use {nome} e {produtos}.'),
      h('button', { class: 'btn primary block', type: 'submit' }, 'Salvar configurações')),
    h('section', { class: 'stack' }, h('h2', {}, 'Catálogo de produtos'), catStatus,
      h('button', { class: 'btn block', onclick: async () => { try { const r = await S.loadBundledCatalog({ force: true }); catStatus.textContent = `${S.state.products.size} produtos no catálogo.`; toast(r.same ? 'Catálogo já está atualizado' : `Catálogo atualizado: ${r.added} novos, ${r.updated} atualizados`, 'ok'); } catch (e) { toast('Sem conexão com o catálogo. Tente com internet.', 'err'); } } }, icon('refresh', 20), 'Atualizar catálogo (precisa de internet)'),
      h('button', { class: 'btn ghost block', onclick: () => csvIn.click() }, icon('download', 20), 'Importar catálogo de planilha (CSV)'),
      h('button', { class: 'btn ghost block', onclick: () => saveFile('modelo-catalogo.csv', toCSV(['codigo', 'nome', 'preco', 'categoria', 'dias'], [['1234', 'Exemplo de produto', 99.9, 'Cuidados com a pele', 60]]), 'text/csv;charset=utf-8') }, 'Baixar modelo da planilha'), csvIn),
    h('section', { class: 'stack' }, h('h2', {}, 'Backup dos dados'),
      h('p', { class: 'muted small' }, 'Seus dados ficam guardados somente neste aparelho. Faça backups com frequência e guarde no WhatsApp, e-mail ou Google Drive.' + (st.lastBackup ? ` Último backup: ${fmtDate(st.lastBackup)}.` : ' Você ainda não fez nenhum backup.')),
      h('button', { class: 'btn primary block', onclick: async () => { const r = await S.exportBackup(); const res = await saveFile(`backup-bela-gestao-${today()}.json`, r, 'application/json'); if (res !== 'cancelled') { toast('Backup criado', 'ok'); go('/config'); } } }, icon('save', 20), 'Fazer backup agora'),
      h('button', { class: 'btn ghost block', onclick: () => backupIn.click() }, 'Restaurar de um backup'), backupIn),
    h('section', { class: 'stack' }, h('h2', {}, 'Zona de risco'),
      h('button', { class: 'btn ghost danger-text block', onclick: async () => {
        if (!await confirmBox('Apagar TODOS os dados?', 'Vendas, clientes, estoque e compras serão apagados deste aparelho. Isso não pode ser desfeito. Faça um backup antes!', { ok: 'Apagar tudo', danger: true })) return;
        await S.eraseEverything(); await S.loadBundledCatalog({ force: true }).catch(() => {}); toast('Dados apagados'); go('/inicio');
      } }, icon('trash', 18), 'Apagar todos os dados')),
    h('p', { class: 'muted small center pad' }, APP_NAME + ' · versão 1.0'));
}
