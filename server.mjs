// Servidor estático mínimo para testar o app localmente: node server.mjs [porta]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvider, BillingService } from './server/billing.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.argv[2]) || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const billing = new BillingService({ provider: createProvider() });
const readBody = req => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) reject(new Error('Corpo muito grande')); });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON inválido')); } });
  req.on('error', reject);
});
const sendJson = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(value)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/api/billing/checkout' && req.method === 'POST') {
    try {
      const input = await readBody(req);
      const result = await billing.createCheckout({ ...input, notificationUrl: input.notificationUrl || `${process.env.PUBLIC_BASE_URL || `http://localhost:${port}`}/api/billing/webhook` });
      return sendJson(res, 201, result);
    } catch (error) { return sendJson(res, error.statusCode || 400, { error: error.message }); }
  }
  if (p === '/api/billing/webhook' && req.method === 'POST') {
    try { const body = await readBody(req); const result = await billing.handleWebhook({ headers: req.headers, body }); return sendJson(res, 200, result); }
    catch (error) { return sendJson(res, error.statusCode || 400, { error: error.message }); }
  }
  // O retorno do navegador é apenas informativo; ativação acontece exclusivamente no webhook.
  if (p === '/api/billing/return' && req.method === 'GET') return sendJson(res, 200, { status: 'pending', message: 'Pagamento em confirmação.' });
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(data);
  } catch { res.writeHead(404).end('não encontrado'); }
}).listen(port, () => console.log(`http://localhost:${port}`));
