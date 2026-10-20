# Configuração de cobrança

O servidor usa mock somente fora de produção. Para desenvolvimento, mantenha explícito:

```sh
BILLING_PROVIDER=mock
PUBLIC_BASE_URL=http://localhost:5173
node server.mjs
```

Em produção, o provedor precisa ser configurado explicitamente (o processo também exige Mercado Pago quando `NODE_ENV=production`):

```sh
NODE_ENV=production
BILLING_PROVIDER=mercado_pago
MERCADOPAGO_ACCESS_TOKEN=...
MERCADOPAGO_WEBHOOK_SECRET=...
PUBLIC_BASE_URL=https://app.exemplo.com
node server.mjs
```

Nunca versionar valores reais dessas variáveis. O endpoint `POST /api/billing/checkout` cria a preferência e retorna `checkoutUrl`. O endpoint `POST /api/billing/webhook` valida `x-signature` com HMAC-SHA256, consulta o pagamento no Mercado Pago e aplica a transição uma única vez por pagamento. O endpoint `GET /api/billing/return` não ativa assinatura: o retorno do navegador é apenas informativo; a ativação depende do webhook autenticado.

Payload mínimo de checkout:

```json
{"customerId":"cliente-1","planId":"pro","title":"Plano Pro","amount":39.90}
```

Os testes provider-neutral rodam com `npm test` e usam apenas implementações in-memory/fakes; nenhum token fica no repositório.
