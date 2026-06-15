import type { Request } from 'express';
import { getRepo, verifyInitData, type User } from '@astro/core';

// Resolve the Telegram user from Mini App initData (header or body).
export async function authenticate(req: Request): Promise<User | null> {
  const initData = (req.header('x-telegram-init-data') ?? req.body?.initData ?? '') as string;
  const tgUser = verifyInitData(initData);
  if (!tgUser) return null;
  return getRepo().getOrCreateUser({
    telegram_id: tgUser.id,
    username: tgUser.username,
    first_name: tgUser.first_name,
  });
}
