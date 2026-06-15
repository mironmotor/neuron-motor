// Central environment configuration. Read once, validated lazily.

function get(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  // Telegram
  telegramBotToken: get('TELEGRAM_BOT_TOKEN'),
  telegramBotUsername: get('TELEGRAM_BOT_USERNAME'),
  webappUrl: get('WEBAPP_URL', 'http://localhost:3000'),
  backendUrl: get('BACKEND_URL', 'http://localhost:4000'),

  // Tribute
  tributeApiKey: get('TRIBUTE_API_KEY'),
  tributeProductLink: get('TRIBUTE_PRODUCT_LINK'),
  tributeProductId: get('TRIBUTE_PRODUCT_ID_FULL_REPORT'),
  tributeWebhookSecret: get('TRIBUTE_WEBHOOK_SECRET_OR_API_KEY'),

  // Astro API
  astroClientId: get('ASTRO_API_CLIENT_ID'),
  astroClientSecret: get('ASTRO_API_CLIENT_SECRET'),
  astroBaseUrl: get('ASTRO_API_BASE_URL'),

  // LLM
  llmProvider: get('LLM_PROVIDER', 'anthropic'),
  anthropicApiKey: get('ANTHROPIC_API_KEY'),
  anthropicModel: get('ANTHROPIC_MODEL', 'claude-opus-4-8'),
  openaiApiKey: get('OPENAI_API_KEY'),
  openaiModel: get('OPENAI_MODEL', 'gpt-4o'),

  // Supabase
  supabaseUrl: get('SUPABASE_URL'),
  supabaseServiceKey: get('SUPABASE_SERVICE_ROLE_KEY'),
  pdfStorageBucket: get('PDF_STORAGE_BUCKET', 'reports'),

  // Pricing
  fullReportPrice: Number(get('FULL_REPORT_PRICE', '990')),
  fullReportCurrency: get('FULL_REPORT_CURRENCY', 'RUB'),

  // Server
  port: Number(get('PORT', '4000')),
  nodeEnv: get('NODE_ENV', 'development'),
};

export const flags = {
  get useSupabase() {
    return Boolean(env.supabaseUrl && env.supabaseServiceKey);
  },
  get useRealAstro() {
    return Boolean(env.astroBaseUrl && env.astroClientId && env.astroClientSecret);
  },
  get useRealLlm() {
    if (env.llmProvider === 'openai') return Boolean(env.openaiApiKey);
    return Boolean(env.anthropicApiKey);
  },
  get useRealTelegram() {
    return Boolean(env.telegramBotToken);
  },
};
