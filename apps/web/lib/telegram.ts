'use client';

// Thin wrapper over the Telegram WebApp SDK (loaded via <script> in layout).
interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  openLink: (url: string) => void;
  themeParams?: Record<string, string>;
  MainButton?: { hide: () => void };
}

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null;
}

export function getInitData(): string {
  const wa = getWebApp();
  // Outside Telegram (browser dev) we send an empty string; the backend's dev
  // fallback accepts it so the flow still works.
  return wa?.initData ?? '';
}

export function openExternal(url: string) {
  const wa = getWebApp();
  if (wa) wa.openLink(url);
  else window.open(url, '_blank');
}
