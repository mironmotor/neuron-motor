'use client';

import { getInitData } from './telegram';
import type { ReportJson, ReportRow } from './types';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';

async function post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': getInitData() },
    body: JSON.stringify({ ...body, initData: getInitData() }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface BirthForm {
  name: string;
  birth_date: string;
  birth_time?: string;
  birth_city: string;
  main_question?: string;
}

export const api = {
  auth: () => post<{ user: unknown }>('/auth/telegram'),
  createProfile: (form: BirthForm) =>
    post<{ profile: { id: string }; approximate_time: boolean }>('/profile/create', { ...form } as Record<string, unknown>),
  preview: () => post<{ teaser_text: string; report: ReportJson }>('/astro/preview'),
  checkout: () => post<{ order_id: string; payment_url: string; amount: number; currency: string }>('/payments/checkout'),
  getReport: async (id: string): Promise<ReportRow> => {
    const res = await fetch(`${BACKEND}/report/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).report as ReportRow;
  },
};

export { BACKEND };
