import express, { Router } from 'express';
import { env, getRepo, getPaymentProvider, processPaidOrder } from '@astro/core';
import { authenticate } from '../auth';

// ─── Checkout (JSON): create a pending order and return the Tribute link ───
export const paymentsRouter = Router();

paymentsRouter.post('/payments/checkout', async (req, res) => {
  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'invalid initData' });

  const repo = getRepo();
  const profile = await repo.getLatestBirthProfile(user.id);
  if (!profile) return res.status(400).json({ error: 'create a birth profile first' });

  const order = await repo.createOrder({
    user_id: user.id,
    birth_profile_id: profile.id,
    product_code: 'full_report',
    payment_provider: 'tribute',
    amount: env.fullReportPrice,
    currency: env.fullReportCurrency,
    status: 'payment_pending',
  });

  const link = await getPaymentProvider().createPaymentLink(order.id);
  res.json({ order_id: order.id, payment_url: link, amount: env.fullReportPrice, currency: env.fullReportCurrency });
});

// ─── Tribute webhook (RAW body for signature verification) ───
export const webhookRouter = Router();

webhookRouter.post('/payments/tribute/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const provider = getPaymentProvider();
  const raw = req.body as Buffer;

  // 1–2: verify signature
  if (!provider.verifyWebhook(raw, req.headers)) {
    return res.status(401).json({ error: 'bad signature' });
  }

  // 3–7: parse + locate user + pending order
  const event = provider.parseWebhook(raw);
  if (event.status !== 'paid') {
    return res.json({ ok: true, ignored: event.status });
  }

  const repo = getRepo();
  // Match order via order_id query echoed into the product link, else by user.
  const orderIdFromQuery = (req.query.order_id as string) || undefined;
  let order = orderIdFromQuery ? await repo.getOrder(orderIdFromQuery) : null;
  if (!order && event.telegramUserId != null) {
    order = await repo.findLatestPendingOrderByTelegramId(event.telegramUserId);
  }
  if (!order) {
    // Plan §4: payment exists but no profile/order yet — acknowledge, reconcile later.
    return res.json({ ok: true, pending_reconciliation: true });
  }

  await repo.updateOrder(order.id, {
    status: 'paid',
    provider_purchase_id: event.purchaseId,
    provider_transaction_id: event.transactionId,
  });

  // Acknowledge fast, then run the generation pipeline in the background
  // (8–12: astro → AI → HTML → PDF → Telegram).
  res.json({ ok: true });
  processPaidOrder(order.id).catch((err) => console.error('[pipeline] failed', err));
});
