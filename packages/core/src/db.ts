import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, flags } from './env';
import type { BirthProfile, Order, OrderStatus, Report, User } from './types';

export interface Repo {
  getOrCreateUser(input: { telegram_id: number; username?: string; first_name?: string }): Promise<User>;
  getUserByTelegramId(telegram_id: number): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  createBirthProfile(input: Partial<BirthProfile> & { user_id: string }): Promise<BirthProfile>;
  getLatestBirthProfile(user_id: string): Promise<BirthProfile | null>;
  createOrder(input: Partial<Order> & { user_id: string; status: OrderStatus }): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  findLatestPendingOrderByTelegramId(telegram_id: number): Promise<Order | null>;
  updateOrder(id: string, patch: Partial<Order>): Promise<Order | null>;
  createAstroCalculation(input: { user_id: string; birth_profile_id?: string; raw_api_json: unknown; normalized_json: unknown }): Promise<void>;
  createReport(input: Partial<Report> & { user_id: string; status: OrderStatus }): Promise<Report>;
  getReport(id: string): Promise<Report | null>;
  getLatestReportByOrder(order_id: string): Promise<Report | null>;
  updateReport(id: string, patch: Partial<Report>): Promise<Report | null>;
}

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

// ───────────────────────────── In-memory (dev) ──────────────────────────
class MemoryRepo implements Repo {
  private users = new Map<string, User>();
  private profiles = new Map<string, BirthProfile>();
  private orders = new Map<string, Order>();
  private reports = new Map<string, Report>();

  async getOrCreateUser(input: { telegram_id: number; username?: string; first_name?: string }): Promise<User> {
    const existing = [...this.users.values()].find((u) => u.telegram_id === input.telegram_id);
    if (existing) return existing;
    const user: User = { id: uuid(), telegram_id: input.telegram_id, username: input.username ?? null, first_name: input.first_name ?? null, created_at: now() };
    this.users.set(user.id, user);
    return user;
  }
  async getUserByTelegramId(telegram_id: number): Promise<User | null> {
    return [...this.users.values()].find((u) => u.telegram_id === telegram_id) ?? null;
  }
  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }
  async createBirthProfile(input: Partial<BirthProfile> & { user_id: string }): Promise<BirthProfile> {
    const profile: BirthProfile = { id: uuid(), created_at: now(), ...input } as BirthProfile;
    this.profiles.set(profile.id, profile);
    return profile;
  }
  async getLatestBirthProfile(user_id: string): Promise<BirthProfile | null> {
    return [...this.profiles.values()].filter((p) => p.user_id === user_id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  }
  async createOrder(input: Partial<Order> & { user_id: string; status: OrderStatus }): Promise<Order> {
    const order: Order = { id: uuid(), created_at: now(), ...input } as Order;
    this.orders.set(order.id, order);
    return order;
  }
  async getOrder(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }
  async findLatestPendingOrderByTelegramId(telegram_id: number): Promise<Order | null> {
    const user = await this.getUserByTelegramId(telegram_id);
    if (!user) return null;
    return [...this.orders.values()]
      .filter((o) => o.user_id === user.id && o.status === 'payment_pending')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  }
  async updateOrder(id: string, patch: Partial<Order>): Promise<Order | null> {
    const o = this.orders.get(id);
    if (!o) return null;
    const updated = { ...o, ...patch };
    this.orders.set(id, updated);
    return updated;
  }
  async createAstroCalculation(): Promise<void> {
    /* not persisted in memory mode */
  }
  async createReport(input: Partial<Report> & { user_id: string; status: OrderStatus }): Promise<Report> {
    const report: Report = { id: uuid(), created_at: now(), ...input } as Report;
    this.reports.set(report.id, report);
    return report;
  }
  async getReport(id: string): Promise<Report | null> {
    return this.reports.get(id) ?? null;
  }
  async getLatestReportByOrder(order_id: string): Promise<Report | null> {
    return [...this.reports.values()].filter((r) => r.order_id === order_id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  }
  async updateReport(id: string, patch: Partial<Report>): Promise<Report | null> {
    const r = this.reports.get(id);
    if (!r) return null;
    const updated = { ...r, ...patch };
    this.reports.set(id, updated);
    return updated;
  }
}

// ───────────────────────────── Supabase ─────────────────────────────────
class SupabaseRepo implements Repo {
  private db: SupabaseClient;
  constructor() {
    this.db = createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false } });
  }
  private async single<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
    const { data, error } = await p;
    if (error) throw error;
    return data;
  }
  async getOrCreateUser(input: { telegram_id: number; username?: string; first_name?: string }): Promise<User> {
    const found = await this.getUserByTelegramId(input.telegram_id);
    if (found) return found;
    const created = await this.single<User>(
      this.db.from('users').insert({ telegram_id: input.telegram_id, username: input.username, first_name: input.first_name }).select().single(),
    );
    return created as User;
  }
  async getUserByTelegramId(telegram_id: number): Promise<User | null> {
    return this.single<User>(this.db.from('users').select('*').eq('telegram_id', telegram_id).maybeSingle());
  }
  async getUserById(id: string): Promise<User | null> {
    return this.single<User>(this.db.from('users').select('*').eq('id', id).maybeSingle());
  }
  async createBirthProfile(input: Partial<BirthProfile> & { user_id: string }): Promise<BirthProfile> {
    return (await this.single<BirthProfile>(this.db.from('birth_profiles').insert(input).select().single())) as BirthProfile;
  }
  async getLatestBirthProfile(user_id: string): Promise<BirthProfile | null> {
    return this.single<BirthProfile>(this.db.from('birth_profiles').select('*').eq('user_id', user_id).order('created_at', { ascending: false }).limit(1).maybeSingle());
  }
  async createOrder(input: Partial<Order> & { user_id: string; status: OrderStatus }): Promise<Order> {
    return (await this.single<Order>(this.db.from('orders').insert(input).select().single())) as Order;
  }
  async getOrder(id: string): Promise<Order | null> {
    return this.single<Order>(this.db.from('orders').select('*').eq('id', id).maybeSingle());
  }
  async findLatestPendingOrderByTelegramId(telegram_id: number): Promise<Order | null> {
    const user = await this.getUserByTelegramId(telegram_id);
    if (!user) return null;
    return this.single<Order>(this.db.from('orders').select('*').eq('user_id', user.id).eq('status', 'payment_pending').order('created_at', { ascending: false }).limit(1).maybeSingle());
  }
  async updateOrder(id: string, patch: Partial<Order>): Promise<Order | null> {
    return this.single<Order>(this.db.from('orders').update(patch).eq('id', id).select().single());
  }
  async createAstroCalculation(input: { user_id: string; birth_profile_id?: string; raw_api_json: unknown; normalized_json: unknown }): Promise<void> {
    const { error } = await this.db.from('astro_calculations').insert(input);
    if (error) throw error;
  }
  async createReport(input: Partial<Report> & { user_id: string; status: OrderStatus }): Promise<Report> {
    return (await this.single<Report>(this.db.from('reports').insert(input).select().single())) as Report;
  }
  async getReport(id: string): Promise<Report | null> {
    return this.single<Report>(this.db.from('reports').select('*').eq('id', id).maybeSingle());
  }
  async getLatestReportByOrder(order_id: string): Promise<Report | null> {
    return this.single<Report>(this.db.from('reports').select('*').eq('order_id', order_id).order('created_at', { ascending: false }).limit(1).maybeSingle());
  }
  async updateReport(id: string, patch: Partial<Report>): Promise<Report | null> {
    return this.single<Report>(this.db.from('reports').update(patch).eq('id', id).select().single());
  }
}

let cached: Repo | null = null;
export function getRepo(): Repo {
  if (cached) return cached;
  cached = flags.useSupabase ? new SupabaseRepo() : new MemoryRepo();
  return cached;
}
