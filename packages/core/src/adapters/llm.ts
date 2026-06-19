import Anthropic from '@anthropic-ai/sdk';
import { env, flags } from '../env';
import { SYSTEM_PROMPT, REPORT_JSON_SCHEMA, buildUserPrompt } from '../prompts';
import type { NormalizedChart, ReportJson, ReportMode } from '../types';

// A single LLM adapter interface so the provider can be swapped (plan §10.5).
export interface LlmAdapter {
  generateReport(chart: NormalizedChart, mode: ReportMode): Promise<ReportJson>;
}

function safeParseReport(raw: string): ReportJson {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const json = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
  return JSON.parse(json) as ReportJson;
}

// ─────────────────────────── Claude (default) ───────────────────────────
class AnthropicLlmAdapter implements LlmAdapter {
  private client = new Anthropic({ apiKey: env.anthropicApiKey });

  async generateReport(chart: NormalizedChart, mode: ReportMode): Promise<ReportJson> {
    // Stream to stay under HTTP timeouts on the longer full report.
    const stream = this.client.messages.stream({
      model: env.anthropicModel, // claude-opus-4-8
      max_tokens: mode === 'full_report' ? 16000 : 4000,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: REPORT_JSON_SCHEMA } },
      messages: [{ role: 'user', content: buildUserPrompt(chart, mode) }],
    });

    const message = await stream.finalMessage();
    const text = message.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') throw new Error('LLM returned no text block');
    return safeParseReport(text.text);
  }
}

// ─────────── OpenAI-compatible (OpenAI, Qwen, MiniMax, DeepSeek, …) ───────────
// Any provider exposing the OpenAI chat-completions API works — just point
// OPENAI_BASE_URL at it and set OPENAI_MODEL + OPENAI_API_KEY.
class OpenAiLlmAdapter implements LlmAdapter {
  async generateReport(chart: NormalizedChart, mode: ReportMode): Promise<ReportJson> {
    const base = env.openaiBaseUrl.replace(/\/$/, '');
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(chart, mode) },
    ];

    const call = (withJsonMode: boolean) =>
      fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.openaiApiKey}` },
        body: JSON.stringify({
          model: env.openaiModel,
          ...(withJsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages,
        }),
      });

    // Some OpenAI-compatible providers (parts of Qwen/MiniMax) reject
    // response_format — fall back to a plain call and parse the JSON ourselves.
    let res = await call(true);
    if (!res.ok && res.status === 400) res = await call(false);
    if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);

    const data: any = await res.json();
    return safeParseReport(data.choices?.[0]?.message?.content ?? '{}');
  }
}

// ───────────────────────────── Mock (no keys) ───────────────────────────
class MockLlmAdapter implements LlmAdapter {
  async generateReport(chart: NormalizedChart, mode: ReportMode): Promise<ReportJson> {
    const name = chart.user.name || 'друг';
    const isPreview = mode === 'preview_report';
    const long = (s: string) => (isPreview ? s : `${s} ${s} (полная версия раскрывает это подробнее, с конкретными шагами и примерами из твоей карты.)`);
    return {
      title: `Astro Map · ${name}`,
      subtitle: `${chart.core.sun} ☉ · ${chart.core.moon} ☾ · асцендент ${chart.core.ascendant}`,
      sections: [
        { key: 'core_personality', title: 'Ядро личности', body: long(`Солнце в ${chart.core.sun} и Луна в ${chart.core.moon} дают тебе сочетание воли и чувствительности.`) },
        { key: 'main_strength', title: 'Главная сила', body: long('Ты умеешь доводить начатое до конца и считывать людей.') },
        { key: 'inner_conflict', title: 'Внутренний конфликт', body: long(`Аспект "${chart.aspects[0] ?? ''}" создаёт напряжение между желанием контроля и потребностью в свободе.`) },
        { key: 'money', title: 'Деньги и реализация', body: long('Деньги приходят через мастерство и репутацию, а не через суету.') },
        { key: 'relationships', title: 'Отношения', body: long('Тебе важен глубокий, честный контакт без игр.') },
        { key: 'purpose', title: 'Предназначение', body: long('Твой вектор — превращать сложный опыт в ясность для других.') },
        { key: 'current_period', title: 'Текущий период', body: long(chart.current_period.theme) },
        { key: 'seven_day_mission', title: 'Миссия на 7 дней', body: 'Маленькие конкретные шаги, чтобы сдвинуть твой главный вопрос.' },
        { key: 'live_session_invite', title: 'Живой разбор', body: 'Если хочешь разобрать это глубже — приходи на живой разбор с экспертом.' },
      ],
      seven_day_plan: [
        'День 1: выпиши свой главный вопрос одним предложением.',
        'День 2: сделай один реальный шаг к деньгам/проекту.',
        'День 3: честный разговор с важным человеком.',
        'День 4: убери одну вещь, которая тебя истощает.',
        'День 5: 30 минут на дело, которое тебя зажигает.',
        'День 6: попроси о помощи или продай свою услугу.',
        'День 7: подведи итог и поставь цель на следующую неделю.',
      ],
      upsell: 'Готов(а) пройти карту вместе с экспертом за 60 минут и собрать план на 30–90 дней? Нажми «Разобрать с экспертом».',
    };
  }
}

let cached: LlmAdapter | null = null;
export function getLlmAdapter(): LlmAdapter {
  if (cached) return cached;
  if (!flags.useRealLlm) {
    cached = new MockLlmAdapter();
  } else if (env.llmProvider === 'openai') {
    cached = new OpenAiLlmAdapter();
  } else {
    cached = new AnthropicLlmAdapter();
  }
  return cached;
}
