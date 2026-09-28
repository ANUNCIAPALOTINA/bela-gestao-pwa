// Desenha o relatório como imagem PNG rosa, pronta para mandar no grupo do WhatsApp.
import { money, pct, int, fmtDate, today, APP_NAME } from './util.js';

const W = 1080, M = 48, MAX_ROWS = 40;
const C = { pink: '#d6246e', pinkD: '#b01a58', pinkL: '#fde4ef', pinkXL: '#fff5f9', ink: '#2a1f28', muted: '#7b6b76', line: '#f0dde6', good: '#1f9d63', warn: '#c77800', bad: '#d64545' };
const FONT = '"Segoe UI", Roboto, system-ui, sans-serif';

// Cada tipo de relatório vira "cartões": título, linhas de apoio, valor à direita e uma etiqueta colorida.
const ROWS = {
  vendas: r => ({ title: r[1], sub: `${r[0]} · ${r[3]}`, sub2: r[2], value: money(r[5]), tag: r[4], tagColor: r[4] === 'Pago' ? C.good : C.warn }),
  produtos: r => ({ title: r[1], sub: `${r[0]} · ${int(r[2])} un.`, value: money(r[3]), tag: 'lucro ' + money(r[5]), tagColor: C.good }),
  compras: r => ({ title: r[3], sub: `${r[0]} · ${r[1]}`, sub2: `${int(r[4])} un. × ${money(r[5])}`, value: money(r[6]) }),
  estoque: r => ({ title: r[1], sub: `${r[0]} · ${int(r[2])} un. · venda ${money(r[5])}`, value: money(r[4]), tag: r[6], tagColor: r[6] === 'Baixo' ? C.warn : C.good }),
  clientes: r => ({ title: r[0], sub: `${int(r[2])} compra(s) · última ${r[4]}`, value: money(r[3]), tag: r[5] > 0 ? 'em aberto ' + money(r[5]) : '', tagColor: C.warn }),
  receber: r => ({ title: r[1], sub: `${r[0]} · ${r[2]} · parcela ${r[3]}`, value: money(r[5]), tag: r[4], tagColor: r[4] === 'Atrasada' ? C.bad : C.good }),
};

function stats(type, rep, m) {
  const t = rep.totals || [], n = rep.rows.length;
  switch (type) {
    case 'vendas': case 'produtos': return [['Vendas', money(m.revenue), C.pinkD], ['Lucro', money(m.profit), C.good], ['Margem', pct(m.margin), C.pinkD]];
    case 'compras': return [['Total comprado', money(t[6] || 0), C.pinkD], ['Peças', int(t[4] || 0), C.pinkD]];
    case 'estoque': return [['Valor em estoque', money(t[4] || 0), C.pinkD], ['Peças', int(t[2] || 0), C.pinkD]];
    case 'clientes': return [['Clientes', int(n), C.pinkD], ['Total comprado', money(rep.rows.reduce((s, r) => s + r[3], 0)), C.pinkD], ['Em aberto', money(rep.rows.reduce((s, r) => s + r[5], 0)), C.warn]];
    case 'receber': return [['A receber', money(t[5] || 0), C.pinkD], ['Parcelas', int(n), C.pinkD]];
    default: return [];
  }
}

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function fit(ctx, text, maxW) {
  text = String(text ?? '');
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text.trimEnd() + '…';
}

export async function reportPng({ type, rep, metrics, title, periodTxt, owner }) {
  const rowFn = ROWS[type], shown = rep.rows.slice(0, MAX_ROWS), extra = rep.rows.length - shown.length;
  const cards = shown.map(rowFn);
  const st = stats(type, rep, metrics);
  const HEAD = owner ? 330 : 290, STAT_H = 150, ROW_GAP = 16, TOTAL_H = 110;
  const rowH = c => (c.sub2 ? 158 : 120);
  let H = HEAD + 40 + (st.length ? STAT_H + 44 : 0) + cards.reduce((s, c) => s + rowH(c) + ROW_GAP, 0) + (extra > 0 ? 70 : 0) + (rep.totals ? TOTAL_H + 30 : 0) + 130;
  if (!cards.length) H = HEAD + 300;

  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.pinkXL; ctx.fillRect(0, 0, W, H);

  // Cabeçalho em degradê rosa
  const g = ctx.createLinearGradient(0, 0, W, HEAD); g.addColorStop(0, '#b01a58'); g.addColorStop(1, '#f06ba0');
  ctx.fillStyle = g; rr(ctx, 0, -60, W, HEAD + 60, 56); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(W - 90, 70, 150, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.beginPath(); ctx.arc(W - 250, HEAD - 20, 90, 0, 7); ctx.fill();
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `700 30px ${FONT}`;
  ctx.fillText(APP_NAME.toUpperCase(), M, 78);
  ctx.fillStyle = '#fff'; ctx.font = `800 70px ${FONT}`; ctx.fillText(fit(ctx, title, W - 2 * M), M, 172);
  ctx.font = `500 36px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillText(periodTxt, M, 226);
  if (owner) { ctx.font = `500 30px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(fit(ctx, owner, W - 2 * M), M, 274); }

  let y = HEAD + 40;
  if (st.length) {
    const gap = 20, w = (W - 2 * M - gap * (st.length - 1)) / st.length;
    st.forEach(([label, value, color], i) => {
      const x = M + i * (w + gap);
      ctx.fillStyle = '#fff'; rr(ctx, x, y, w, STAT_H, 28); ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.muted; ctx.font = `500 26px ${FONT}`; ctx.fillText(fit(ctx, label, w - 40), x + 24, y + 48);
      ctx.fillStyle = color; ctx.font = `800 ${st.length > 2 ? 40 : 46}px ${FONT}`; ctx.fillText(fit(ctx, value, w - 40), x + 24, y + 108);
    });
    y += STAT_H + 44;
  }

  if (!cards.length) {
    ctx.fillStyle = C.muted; ctx.font = `500 34px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('Nenhum registro neste período.', W / 2, y + 90); ctx.textAlign = 'left';
  }
  for (const c of cards) {
    const h = rowH(c);
    ctx.fillStyle = '#fff'; rr(ctx, M, y, W - 2 * M, h, 26); ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = C.pink; rr(ctx, M, y + 22, 8, h - 44, 4); ctx.fill();
    ctx.textAlign = 'right'; ctx.fillStyle = C.ink; ctx.font = `800 38px ${FONT}`; ctx.fillText(c.value, W - M - 26, y + 56);
    const valW = ctx.measureText(c.value).width;
    if (c.tag) { ctx.fillStyle = c.tagColor || C.muted; ctx.font = `700 26px ${FONT}`; ctx.fillText(fit(ctx, c.tag, 330), W - M - 26, y + 96); }
    ctx.textAlign = 'left';
    const left = M + 34, maxW = Math.max(300, W - 2 * M - 34 - 26 - Math.max(valW, c.tag ? Math.min(330, ctx.measureText(c.tag).width) : 0) - 24);
    ctx.fillStyle = C.ink; ctx.font = `700 34px ${FONT}`; ctx.fillText(fit(ctx, c.title, maxW), left, y + 52);
    ctx.fillStyle = C.muted; ctx.font = `500 27px ${FONT}`; ctx.fillText(fit(ctx, c.sub, maxW), left, y + 92);
    if (c.sub2) ctx.fillText(fit(ctx, c.sub2, W - 2 * M - 34 - 26), left, y + 132);
    y += h + ROW_GAP;
  }
  if (extra > 0) {
    ctx.fillStyle = C.pinkD; ctx.font = `600 28px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(`+ ${extra} registro(s) — veja tudo na planilha`, W / 2, y + 38); ctx.textAlign = 'left'; y += 70;
  }
  if (rep.totals && cards.length) {
    const tot = rep.totals.filter(v => typeof v === 'number');
    const main = type === 'vendas' ? metrics.revenue : type === 'produtos' ? metrics.revenue : type === 'compras' ? rep.totals[6] : type === 'estoque' ? rep.totals[4] : type === 'receber' ? rep.totals[5] : (tot.length ? tot[tot.length - 1] : 0);
    y += 14;
    const tg = ctx.createLinearGradient(M, 0, W - M, 0); tg.addColorStop(0, C.pinkD); tg.addColorStop(1, C.pink);
    ctx.fillStyle = tg; rr(ctx, M, y, W - 2 * M, TOTAL_H, 30); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 40px ${FONT}`; ctx.fillText('TOTAL', M + 34, y + 69);
    ctx.textAlign = 'right'; ctx.fillText(money(main), W - M - 34, y + 69); ctx.textAlign = 'left'; y += TOTAL_H + 16;
  }
  ctx.fillStyle = C.muted; ctx.font = `500 24px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(`Gerado em ${fmtDate(today())} · ${APP_NAME}`, W / 2, H - 52); ctx.textAlign = 'left';
  ctx.fillStyle = C.pink; ctx.fillRect(0, H - 14, W, 14);

  return new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('Não foi possível gerar a imagem.'))), 'image/png'));
}
