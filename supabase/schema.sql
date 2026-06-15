-- Astro AI Telegram MVP — database schema (Supabase / Postgres)
-- Run in the Supabase SQL editor, or: psql "$DATABASE_URL" -f supabase/schema.sql
--
-- Status values used across the pipeline (stored as plain text):
--   profile_created · preview_generated · payment_pending · paid
--   astro_calculated · report_generating · report_ready
--   pdf_generating · pdf_ready · report_sent · failed · refunded

create extension if not exists "pgcrypto";

-- ───────────────────────── users ─────────────────────────
create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,
  username    text,
  first_name  text,
  created_at  timestamptz not null default now()
);

-- ─────────────────────── birth_profiles ──────────────────
create table if not exists birth_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  name          text,
  birth_date    date,
  birth_time    time,
  birth_city    text,
  timezone      text,
  latitude      numeric,
  longitude     numeric,
  main_question text,
  created_at    timestamptz not null default now()
);

-- ────────────────────────── orders ───────────────────────
create table if not exists orders (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  birth_profile_id       uuid references birth_profiles(id) on delete set null,
  product_code           text,
  payment_provider       text,
  provider_purchase_id   text,
  provider_transaction_id text,
  amount                 numeric,
  currency               text,
  status                 text not null default 'payment_pending',
  created_at             timestamptz not null default now()
);

-- ─────────────────────── astro_calculations ──────────────
create table if not exists astro_calculations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  birth_profile_id uuid references birth_profiles(id) on delete set null,
  raw_api_json     jsonb,
  normalized_json  jsonb,
  created_at       timestamptz not null default now()
);

-- ───────────────────────── reports ───────────────────────
create table if not exists reports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  birth_profile_id uuid references birth_profiles(id) on delete set null,
  order_id         uuid references orders(id) on delete set null,
  report_json      jsonb,
  teaser_text      text,
  full_text        text,
  html_url         text,
  pdf_url          text,
  status           text not null default 'report_generating',
  created_at       timestamptz not null default now()
);

-- ────────────────────────── jobs ─────────────────────────
create table if not exists jobs (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,
  payload    jsonb,
  status     text not null default 'queued',
  retries    int not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_user        on orders(user_id);
create index if not exists idx_orders_status       on orders(status);
create index if not exists idx_birth_profiles_user on birth_profiles(user_id);
create index if not exists idx_reports_user        on reports(user_id);
create index if not exists idx_reports_order       on reports(order_id);
