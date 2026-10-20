import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

export const SUBSCRIPTION_STATES = Object.freeze({
  pending: 'pending', active: 'active', past_due: 'past_due', canceled: 'canceled', expired: 'expired',
});

export class MemoryBillingStore {
  constructor() { this.checkouts = new Map(); this.subscriptions = new Map(); this.events = new Set(); }
  async putCheckout(value) { this.checkouts.set(value.id, structuredClone(value)); return value; }
  async getCheckout(id) { return this.checkouts.get(id) || null; }
  async putSubscription(value) { this.subscriptions.set(value.customerId, structuredClone(value)); return value; }
  async getSubscription(customerId) { return this.subscriptions.get(customerId) || null; }
  async hasEvent(id) { return this.events.has(id); }
  async putEvent(id) { this.events.add(id); }
}

function jsonFetch(fetchImpl, url, options) {
  return fetchImpl(url, { ...options, headers: { Accept: 'application/json', ...(options?.headers || {}) } }).then(async res => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Mercado Pago respondeu HTTP ${res.status}`);
    return body;
  });
}

export function createMockProvider({ baseUrl = 'http://localhost:5173' } = {}) {
  return {
    name: 'mock',
    async createCheckout(input) {
      const id = `mock-${randomUUID()}`;
      return { id, url: `${baseUrl}/billing/mock-checkout?id=${encodeURIComponent(id)}`, status: 'pending', input };
    },
    async getPayment(paymentId) { return { id: paymentId, status: 'approved' }; },
    verifyWebhook() { return true; },
  };
}

export function createMercadoPagoProvider({ accessToken, webhookSecret, apiBase = 'https://api.mercadopago.com', fetchImpl = fetch } = {}) {
  if (!accessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN é obrigatório.');
  if (!webhookSecret) throw new Error('MERCADOPAGO_WEBHOOK_SECRET é obrigatório.');
  return {
    name: 'mercado_pago',
    async createCheckout(input) {
      const preference = await jsonFetch(fetchImpl, `${apiBase}/checkout/preferences`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ id: input.planId, title: input.title, quantity: 1, currency_id: 'BRL', unit_price: input.amount }],
          external_reference: input.customerId,
          notification_url: input.notificationUrl,
          back_urls: input.backUrls,
          auto_return: 'approved',
        }),
      });
      return { id: preference.id, url: preference.init_point || preference.sandbox_init_point, status: 'pending' };
    },
    async getPayment(paymentId) {
      return jsonFetch(fetchImpl, `${apiBase}/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    },
    verifyWebhook(headers, body) {
      const signature = headers['x-signature'] || headers['X-Signature'];
      const requestId = headers['x-request-id'] || headers['X-Request-Id'] || '';
      const dataId = String(body?.data?.id || '').toLowerCase();
      if (!signature || !dataId) return false;
      const parts = Object.fromEntries(signature.split(',').map(part => part.trim().split('=')));
      if (!parts.ts || !parts.v1) return false;
      const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
      const expected = createHmac('sha256', webhookSecret).update(manifest).digest('hex');
      const actual = Buffer.from(parts.v1, 'hex'); const wanted = Buffer.from(expected, 'hex');
      return actual.length === wanted.length && timingSafeEqual(actual, wanted);
    },
  };
}

export function createProvider(env = process.env) {
  const mode = env.BILLING_PROVIDER || (env.NODE_ENV === 'production' ? 'mercado_pago' : 'mock');
  if (mode === 'mock') return createMockProvider({ baseUrl: env.PUBLIC_BASE_URL || 'http://localhost:5173' });
  if (mode === 'mercado_pago') return createMercadoPagoProvider({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN, webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET });
  throw new Error(`BILLING_PROVIDER inválido: ${mode}`);
}

export class BillingService {
  constructor({ provider, store = new MemoryBillingStore(), now = () => new Date().toISOString() }) { this.provider = provider; this.store = store; this.now = now; }
  async createCheckout({ customerId, planId, title, amount, notificationUrl, backUrls }) {
    if (!customerId || !planId || !title || !Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('customerId, planId, title e amount são obrigatórios.');
    const result = await this.provider.createCheckout({ customerId, planId, title, amount: Number(amount), notificationUrl, backUrls });
    const checkout = { id: result.id, customerId, planId, amount: Number(amount), status: 'pending', createdAt: this.now() };
    await this.store.putCheckout(checkout);
    await this.store.putSubscription({ customerId, planId, state: 'pending', updatedAt: checkout.createdAt });
    return { checkoutId: result.id, checkoutUrl: result.url, status: 'pending' };
  }
  async handleWebhook({ headers, body }) {
    if (!this.provider.verifyWebhook(headers, body)) { const e = new Error('Webhook inválido.'); e.statusCode = 401; throw e; }
    const eventId = `${body.type || 'payment'}:${body.data?.id || body.id || ''}`;
    if (await this.store.hasEvent(eventId)) return { duplicate: true };
    const payment = await this.provider.getPayment(String(body.data.id));
    const customerId = payment.external_reference || body.external_reference;
    const checkout = payment.external_reference ? null : await this.store.getCheckout(payment.external_reference);
    const resolvedCustomerId = customerId || checkout?.customerId;
    if (!resolvedCustomerId) throw new Error('Pagamento sem cliente associado.');
    const previous = await this.store.getSubscription(resolvedCustomerId) || {};
    const state = payment.status === 'approved' ? 'active' : payment.status === 'pending' ? 'pending' : payment.status === 'cancelled' ? 'canceled' : 'past_due';
    await this.store.putSubscription({ ...previous, customerId: resolvedCustomerId, state, paymentId: String(payment.id), updatedAt: this.now() });
    await this.store.putEvent(eventId);
    return { duplicate: false, customerId: resolvedCustomerId, state };
  }
}
