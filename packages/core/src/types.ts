// Shared domain types for the Astro AI Telegram MVP.

export type OrderStatus =
  | 'profile_created'
  | 'preview_generated'
  | 'payment_pending'
  | 'paid'
  | 'astro_calculated'
  | 'report_generating'
  | 'report_ready'
  | 'pdf_generating'
  | 'pdf_ready'
  | 'report_sent'
  | 'failed'
  | 'refunded';

export interface User {
  id: string;
  telegram_id: number;
  username?: string | null;
  first_name?: string | null;
  created_at: string;
}

export interface BirthProfile {
  id: string;
  user_id: string;
  name?: string | null;
  birth_date?: string | null; // YYYY-MM-DD
  birth_time?: string | null; // HH:MM
  birth_city?: string | null;
  timezone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  main_question?: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  birth_profile_id?: string | null;
  product_code?: string | null;
  payment_provider?: string | null;
  provider_purchase_id?: string | null;
  provider_transaction_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  status: OrderStatus;
  created_at: string;
}

export interface Report {
  id: string;
  user_id: string;
  birth_profile_id?: string | null;
  order_id?: string | null;
  report_json?: ReportJson | null;
  teaser_text?: string | null;
  full_text?: string | null;
  html_url?: string | null;
  pdf_url?: string | null;
  status: OrderStatus;
  created_at: string;
}

// ─── Normalized astro data handed to the AI (see plan §6) ───
export interface NormalizedChart {
  user: {
    name: string;
    birth_date: string;
    birth_time: string;
    birth_city: string;
    main_question: string;
  };
  core: { sun: string; moon: string; ascendant: string };
  houses: Record<string, string>;
  planets: Record<string, string>;
  aspects: string[];
  current_period: { main_transit: string; theme: string };
}

// ─── Structured report the AI returns (drives HTML + PDF) ───
export interface ReportSection {
  key: string;
  title: string;
  body: string;
}

export interface ReportJson {
  title: string;
  subtitle: string;
  sections: ReportSection[]; // 9 sections per the system prompt
  seven_day_plan: string[];
  upsell: string;
}

export type ReportMode = 'preview_report' | 'full_report';
