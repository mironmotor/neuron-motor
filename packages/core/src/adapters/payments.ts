import crypto from 'node:crypto';
import { env } from '../env';

// Payment event normalized from a provider webhook (plan §8).
export interface PaymentEvent {
  telegramUserId: number | null;
  productId: string | null;
  purchaseId: string | null;
  transactionId: string | null;
  amount: number | null;
  currency: string | null;
  status: 'paid' | 'refunded' | 'unknown';
  raw: unknown;
}

// Provider-agnostic interface so Tribute today / ЮKassa / Stars tomorrow can be
// swapped without rewriting the product (plan §8 "Важно").
export interface PaymentProvider {
  readonly name: string;
  createPaymentLink(orderId: string): Promise<string>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(rawBody: Buffer): PaymentEvent;
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string {
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
}

function toNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export class TributeProvider implements PaymentProvider {
  readonly name = 'tribute';

  async createPaymentLink(orderId: string): Promise<string> {
    // Tribute uses a static product link; we append our order id so the webhook
    // (and manual reconciliation) can tie a payment back to the order.
    const base = env.tributeProductLink || 'https://tribute.tg/p/unconfigured';
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}order_id=${encodeURIComponent(orderId)}`;
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const secret = env.tributeWebhookSecret;
    // Dev fallback: without a configured secret we accept (so the local flow
    // works end-to-end). NEVER ship to production without the secret.
    if (!secret) return env.nodeEnv !== 'production';

    const signature = header(headers, 'trbt-signature') || header(headers, 'x-signature');
    if (!signature) return false;

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  parseWebhook(rawBody: Buffer): PaymentEvent {
    let payload: any = {};
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      /* keep empty */
    }
    const p = payload.payload ?? payload;
    const eventName: string = String(payload.name ?? payload.event ?? '').toLowerCase();
    const status: PaymentEvent['status'] = eventName.includes('refund')
      ? 'refunded'
      : eventName.includes('cancel')
        ? 'unknown'
        : 'paid';

    return {
      telegramUserId: toNumber(p.telegram_user_id ?? p.telegram_id ?? p.user_id),
      productId: p.product_id != null ? String(p.product_id) : null,
      purchaseId: p.purchase_id != null ? String(p.purchase_id) : null,
      transactionId:
        p.transaction_id != null ? String(p.transaction_id) : p.id != null ? String(p.id) : null,
      amount: toNumber(p.amount),
      currency: p.currency != null ? String(p.currency) : null,
      status,
      raw: payload,
    };
  }
}

export function getPaymentProvider(): PaymentProvider {
  return new TributeProvider();
}
