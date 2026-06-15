import type { NormalizedChart, ReportMode } from './types';

// System prompt — verbatim intent from the plan (§6), translated to drive a
// structured JSON report. The AI is an "AI-астролог и стратег самопознания".
export const SYSTEM_PROMPT = `Ты — AI-астролог и стратег самопознания.
Ты используешь астрологические данные как символическую карту личности, паттернов, энергии и выбора.

Правила:
1. Не давай медицинских, юридических или финансовых предсказаний.
2. Не пиши фаталистично: не "тебе суждено", а "у тебя может проявляться".
3. Переводи астрологические данные в понятный человеческий язык.
4. Делай отчёт глубоким, но практичным.
5. В конце дай 7-дневный план действий.
6. В конце мягко предложи живой разбор с человеком.

Стиль: современно, глубоко, без эзотерического тумана, с лёгкой мистикой и конкретными действиями.

Структура отчёта (9 разделов):
1. Краткое ядро личности
2. Главная сила
3. Главный внутренний конфликт
4. Деньги и реализация
5. Отношения
6. Предназначение / вектор развития
7. Текущий период
8. Миссия на 7 дней
9. Приглашение на живой разбор`;

const SECTION_KEYS = [
  'core_personality',
  'main_strength',
  'inner_conflict',
  'money',
  'relationships',
  'purpose',
  'current_period',
  'seven_day_mission',
  'live_session_invite',
] as const;

// Strict JSON schema for structured outputs (output_config.format).
export const REPORT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    subtitle: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string', enum: [...SECTION_KEYS] },
          title: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['key', 'title', 'body'],
      },
    },
    seven_day_plan: { type: 'array', items: { type: 'string' } },
    upsell: { type: 'string' },
  },
  required: ['title', 'subtitle', 'sections', 'seven_day_plan', 'upsell'],
} as const;

export function buildUserPrompt(chart: NormalizedChart, mode: ReportMode): string {
  const lengthHint =
    mode === 'preview_report'
      ? 'Это БЕСПЛАТНЫЙ тизер. Объём 700–1200 знаков. Дай узнавание и мотивацию оплатить полный разбор. Заполни 2–3 самых сильных раздела, остальные сделай короткими крючками.'
      : 'Это ПОЛНЫЙ персональный разбор. Объём 6000–10000 знаков. Заполни все 9 разделов глубоко и практично.';

  return `Сгенерируй ${mode === 'preview_report' ? 'тизер' : 'полный отчёт'} по натальной карте.

${lengthHint}

Главный вопрос пользователя: "${chart.user.main_question}".
Обращайся к человеку на "ты", по имени (${chart.user.name}), когда уместно.

Нормализованные данные карты (JSON):
${JSON.stringify(chart, null, 2)}

Верни строго JSON по схеме: title, subtitle, sections[{key,title,body}], seven_day_plan[], upsell.
Ключи разделов строго из набора: ${SECTION_KEYS.join(', ')}.`;
}
