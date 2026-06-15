import crypto from 'node:crypto';
import { env } from './env';

const API = () => `https://api.telegram.org/bot${env.telegramBotToken}`;

export interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export function inlineKeyboard(rows: InlineButton[][]) {
  return { inline_keyboard: rows };
}

export async function sendMessage(chatId: number | string, text: string, replyMarkup?: unknown): Promise<void> {
  if (!env.telegramBotToken) {
    console.log(`[telegram:mock] sendMessage(${chatId}): ${text.slice(0, 120)}…`);
    return;
  }
  const res = await fetch(`${API()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: replyMarkup, disable_web_page_preview: true }),
  });
  if (!res.ok) console.error('[telegram] sendMessage failed', await res.text());
}

export async function sendDocument(
  chatId: number | string,
  file: Buffer | Uint8Array,
  filename: string,
  caption?: string,
  replyMarkup?: unknown,
): Promise<void> {
  if (!env.telegramBotToken) {
    console.log(`[telegram:mock] sendDocument(${chatId}): ${filename} (${file.byteLength} bytes)`);
    return;
  }
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) {
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
  }
  if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form.append('document', new Blob([file as any], { type: 'application/pdf' }), filename);
  const res = await fetch(`${API()}/sendDocument`, { method: 'POST', body: form });
  if (!res.ok) console.error('[telegram] sendDocument failed', await res.text());
}

// ─── Mini App initData verification (Telegram WebApp auth spec) ───
export interface TelegramInitUser {
  id: number;
  username?: string;
  first_name?: string;
}

export function verifyInitData(initData: string): TelegramInitUser | null {
  if (!env.telegramBotToken) {
    // Dev fallback: trust the payload so the Mini App works without a bot token.
    try {
      const params = new URLSearchParams(initData);
      const user = JSON.parse(params.get('user') ?? '{}');
      return user?.id ? user : { id: 0, first_name: 'Dev' };
    } catch {
      return { id: 0, first_name: 'Dev' };
    }
  }
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(env.telegramBotToken).digest();
    const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    if (computed !== hash) return null;
    return JSON.parse(params.get('user') ?? '{}') as TelegramInitUser;
  } catch {
    return null;
  }
}
