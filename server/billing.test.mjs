import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { BillingService, MemoryBillingStore, createMockProvider, createMercadoPagoProvider } from './billing.mjs';

test('checkout mock começa pendente e retorno não é ativação', async () => {
  const store = new MemoryBillingStore();
  const service = new BillingService({ store, provider: createMockProvider() });
  const checkout = await service.createCheckout({ customerId: 'c-1', planId: 'pro', title: 'Plano Pro', amount: 39.9 });
  assert.equal(checkout.status, 'pending');
  assert.equal((await store.getSubscription('c-1')).state, 'pending');
});

test('webhook autenticado ativa assinatura e repetição é idempotente', async () => {
  const secret = 'test-secret';
  const dataId = 'pay-42'; const requestId = 'req-1'; const ts = '1700000000';
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const sig = createHmac('sha256', secret).update(manifest).digest('hex');
  const provider = createMercadoPagoProvider({ accessToken: 'not-a-real-token', webhookSecret: secret, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: dataId, status: 'approved', external_reference: 'c-1' }) }) });
  const store = new MemoryBillingStore(); const service = new BillingService({ provider, store });
  const body = { type: 'payment', data: { id: dataId } };
  const headers = { 'x-signature': `ts=${ts},v1=${sig}`, 'x-request-id': requestId };
  assert.deepEqual(await service.handleWebhook({ headers, body }), { duplicate: false, customerId: 'c-1', state: 'active' });
  assert.deepEqual(await service.handleWebhook({ headers, body }), { duplicate: true });
  assert.equal((await store.getSubscription('c-1')).state, 'active');
});

test('webhook sem assinatura não altera assinatura', async () => {
  const store = new MemoryBillingStore();
  const provider = createMercadoPagoProvider({ accessToken: 'not-a-real-token', webhookSecret: 'secret', fetchImpl: async () => { throw new Error('não deveria consultar'); } });
  const service = new BillingService({ provider, store });
  await assert.rejects(() => service.handleWebhook({ headers: {}, body: { data: { id: 'x' } } }), /Webhook inválido/);
  assert.equal(await store.getSubscription('c-1'), null);
});
