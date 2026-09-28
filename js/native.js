// Ponte com o app Android (Capacitor). No navegador/PWA nada aqui faz efeito: isNative() é falso.
export const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

const plugins = {};
// Sem empacotador não existe Capacitor.registerPlugin: os plugins do app já vêm prontos em Capacitor.Plugins.
const plugin = name => {
  const cap = window.Capacitor;
  const p = plugins[name] || (plugins[name] = (cap.Plugins && cap.Plugins[name]) || (cap.registerPlugin && cap.registerPlugin(name)));
  if (!p) throw new Error(`plugin ${name} indisponível`);
  return p;
};

// Grava o arquivo no cache do app e abre a folha de compartilhamento do Android (WhatsApp, Drive, e-mail...).
export async function shareFile(filename, content, title) {
  const { uri } = await plugin('Filesystem').writeFile({ path: filename, data: content, directory: 'CACHE', encoding: 'utf8' });
  await plugin('Share').share({ title: title || filename, url: uri, dialogTitle: 'Enviar / salvar arquivo' });
}

// Igual ao shareFile, mas para arquivos binários (imagem PNG): grava em base64 e abre o compartilhar do Android.
export async function shareBlob(filename, blob, title) {
  const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  const { uri } = await plugin('Filesystem').writeFile({ path: filename, data, directory: 'CACHE' });
  await plugin('Share').share({ title: title || filename, url: uri, dialogTitle: 'Enviar no WhatsApp' });
}

export function initNative() {
  if (!isNative()) return;
  document.documentElement.classList.add('native');
  // Links externos (WhatsApp, telefone, sites) abrem fora do app.
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.href || '';
    if (/^(https?:|tel:|mailto:|whatsapp:|sms:)/i.test(href) && !href.startsWith(location.origin)) { e.preventDefault(); location.href = href; }
  }, true);
  // "Salvar PDF / imprimir" usa o serviço de impressão do Android (tem "Salvar como PDF").
  const webPrint = window.print.bind(window);
  window.print = () => window.AndroidPrint ? window.AndroidPrint.print(document.title || 'Relatório') : webPrint();
}
