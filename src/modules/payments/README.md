# Payments

O módulo de pagamentos usa Stripe como provedor único.

## Fluxos Ativos

- Cobrança do aluno via Stripe PaymentIntent na conta da plataforma.
- Cartões salvos via Stripe Customer e SetupIntent.
- Onboarding e recebimento do personal via Stripe Connect.
- Liberação de saldo para a carteira interna após conclusão da aula.
- Saque manual do personal para a conta conectada Stripe.
- Refunds e disputes via Stripe.

## Webhooks

- `POST /webhooks/stripe`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.closed`
- `account.updated`

## Ambiente

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_API_VERSION=2026-02-25.clover
STRIPE_CONNECT_API_VERSION=2026-02-25.clover
STRIPE_DEFAULT_CURRENCY=brl
```

Mercado Pago foi removido no cutover. Novas cobranças, cartões, webhooks,
refunds e saques devem passar apenas pelo Stripe.
