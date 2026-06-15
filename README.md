# 🔮 Astro AI Telegram MVP

Telegram-бот + Mini App, который строит натальную карту, превращает её в AI-разбор,
принимает оплату через Tribute и отдаёт пользователю красивый отчёт в Telegram + PDF.

> Денежный контур: **заявка → расчёт карты → оплата → AI-отчёт → апсейл на живой разбор.**

## Архитектура

Монорепозиторий (npm workspaces):

```
packages/core      Общая логика: типы, env, БД (Supabase + in-memory),
                   адаптеры LLM / Astro / Payments, PDF (Puppeteer),
                   Telegram Bot API, конвейер генерации отчёта.
apps/api           Express backend: эндпоинты, вебхук Tribute, пайплайн.
apps/bot           Telegram-бот (Telegraf): /start, кнопка Mini App, апсейлы.
apps/web           Next.js Mini App: главная → форма → тизер → paywall → статус,
                   а также страница отчёта /report/:id (её печатает Puppeteer в PDF).
supabase/schema.sql  Схема БД (6 таблиц).
```

Поток оплаты (`apps/api`): `webhook Tribute` → проверка подписи → `order=paid`
→ Astro API → AI (полный отчёт) → запись в БД → PDF (печать страницы `/report/:id`)
→ отправка текста + PDF + кнопок апсейла в Telegram.

### Адаптеры и mock-режим

Приложение запускается **без единого ключа** — каждый внешний сервис имеет mock:

| Слой      | Реальный режим включается, когда…           | Иначе                         |
|-----------|---------------------------------------------|-------------------------------|
| LLM       | задан `ANTHROPIC_API_KEY` (по умолчанию Claude `claude-opus-4-8`) | детерминированный mock-отчёт |
| Astro API | заданы `ASTRO_API_*`                         | детерминированная mock-карта  |
| БД        | заданы `SUPABASE_URL` + ключ                 | in-memory store (только dev)  |
| Telegram  | задан `TELEGRAM_BOT_TOKEN`                    | вывод в консоль               |
| Payments  | задан `TRIBUTE_WEBHOOK_SECRET_OR_API_KEY`     | подпись принимается (dev)     |

LLM подключён через единый интерфейс `LlmAdapter` — по умолчанию **Anthropic Claude**
(`@anthropic-ai/sdk`, structured outputs + adaptive thinking). `LLM_PROVIDER=openai`
переключает на OpenAI. Платежи — через интерфейс `PaymentProvider` (Tribute сегодня,
ЮKassa / Stars завтра — без переписывания продукта).

## Быстрый старт (локально, без ключей)

**Требования:** Node.js ≥ 20.

```bash
npm install
cp .env.example .env        # можно оставить пустым — заработает на mock
npm run dev:api             # http://localhost:4000  (бэкенд)
npm run dev:web             # http://localhost:3000  (Mini App)
# бот стартует только с TELEGRAM_BOT_TOKEN:
# npm run dev:bot
```

Проверка бэкенда: `curl http://localhost:4000/health` — покажет активные режимы.

Сквозной тест без бота и оплаты:

```bash
# 1. профиль + тизер сгенерируются через Mini App (http://localhost:3000)
# 2. эмуляция оплаченного заказа (order_id берётся из ответа /payments/checkout):
curl -X POST http://localhost:4000/report/generate \
  -H 'Content-Type: application/json' -d '{"order_id":"<ID>"}'
# отчёт + PDF «отправятся» в консоль (mock Telegram); PDF доступен на /report/<reportId>/pdf
```

## Боевой запуск (по плану «1 день»)

1. **Бот:** создай бота у @BotFather → `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`.
   В настройках Mini App укажи `WEBAPP_URL`.
2. **Tribute:** создай продукт «AI Astro Map — полный отчёт» (990 ₽), получи product link
   → `TRIBUTE_PRODUCT_LINK`; включи webhook на `BACKEND_URL/payments/tribute/webhook`,
   секрет → `TRIBUTE_WEBHOOK_SECRET_OR_API_KEY`.
3. **Supabase:** создай проект, выполни `supabase/schema.sql`, создай Storage-бакет
   `reports` (public). Заполни `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
4. **Astro API:** `ASTRO_API_BASE_URL` + `ASTRO_API_CLIENT_ID/SECRET`
   (адаптер нормализует ответ в `core/houses/planets/aspects/current_period`).
5. **AI:** `ANTHROPIC_API_KEY` (модель `claude-opus-4-8`).
6. Хостинг: `apps/api` + `apps/bot` на Railway/Render (long-running),
   `apps/web` на Vercel. Puppeteer требует флаги `--no-sandbox` (уже заданы)
   и установленный Chrome: `npx puppeteer browsers install chrome`
   (без него PDF-шаг мягко падает, а текст отчёта всё равно доставляется).

Все переменные — в `.env.example`.

## Эндпоинты бэкенда

| Метод | Путь                          | Назначение                                   |
|-------|-------------------------------|----------------------------------------------|
| GET   | `/health`                     | Статус + активные режимы                     |
| POST  | `/auth/telegram`              | Проверка Telegram initData, upsert юзера     |
| POST  | `/profile/create`             | Сохранение данных рождения                   |
| POST  | `/astro/preview`              | Бесплатный тизер                             |
| POST  | `/payments/checkout`          | Создать заказ + ссылку Tribute               |
| POST  | `/payments/tribute/webhook`   | Приём оплаты (raw body, проверка подписи)    |
| POST  | `/report/generate`            | Ручной/внутренний запуск полного отчёта      |
| GET   | `/report/:id`                 | JSON отчёта (для Mini App и печати PDF)       |
| GET   | `/report/:id/pdf`             | PDF (dev: in-memory; prod: Supabase Storage)  |

## Скрипты

```bash
npm run dev          # api + bot + web одновременно (concurrently)
npm run dev:api      # только бэкенд
npm run dev:web      # только Mini App
npm run dev:bot      # только бот (нужен TELEGRAM_BOT_TOKEN)
npm run build        # сборка Mini App
npm run typecheck    # проверка типов core + api + bot
```

## Принцип продукта

В первый день не строим империю — строим работающую дверь: человек зашёл, понял
ценность, оплатил, получил красивый отчёт. Всё остальное — второй слой продукта.

## Лицензия

MIT
