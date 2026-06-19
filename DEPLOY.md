# Деплой Astro AI MVP

> Я не могу задеплоить в твой аккаунт из песочницы (нет доступа к твоим
> Render/Vercel/Supabase). Поэтому всё подготовлено так, чтобы запуск занял
> ~10 минут самообслуживанием. Ниже — точный путь.

Нужен **только один LLM-ключ** (Claude или любой OpenAI-совместимый: Qwen,
MiniMax, DeepSeek, …). Astro API — опционально (без него работает встроенный
fallback). Supabase нужен для хранения заказов/отчётов в проде.

## Вариант A — Render (один Blueprint, всё из этого репо) ⭐ рекомендую

1. Залей репозиторий на GitHub (ветка уже запушена).
2. **Supabase:** создай проект → SQL Editor → выполни `supabase/schema.sql`
   → Storage → создай public-бакет `reports`. Сохрани `Project URL` и
   `service_role` ключ.
3. **Render → New → Blueprint** → подключи репо. Render прочитает `render.yaml`
   и создаст 3 сервиса: `astro-api`, `astro-bot`, `astro-web`.
4. Заполни секреты (отмечены `sync:false`) в дашборде:
   - `ANTHROPIC_API_KEY` **или** (`LLM_PROVIDER=openai` + `OPENAI_API_KEY` +
     `OPENAI_BASE_URL` + `OPENAI_MODEL`).
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`.
   - `TRIBUTE_PRODUCT_LINK`, `TRIBUTE_WEBHOOK_SECRET_OR_API_KEY`.
5. **2-pass URL wiring** (после первого деплоя у сервисов появятся адреса):
   - `astro-api`: `BACKEND_URL` = свой URL; `WEBAPP_URL` = URL `astro-web`.
   - `astro-bot`: `WEBAPP_URL` = URL `astro-web`.
   - `astro-web`: `NEXT_PUBLIC_BACKEND_URL` = URL `astro-api` → **Redeploy** web.
6. **@BotFather:** задай Mini App / Menu Button на URL `astro-web`.
7. **Tribute:** webhook → `https://<astro-api>/payments/tribute/webhook`.

Готово: `/start` в боте → Mini App → форма → тизер → оплата → отчёт + PDF.

## Вариант B — Vercel (Mini App) + Railway (api + bot)

- **Vercel:** New Project → этот репо → **Root Directory = `apps/web`** →
  env `NEXT_PUBLIC_BACKEND_URL` = URL бэкенда.
- **Railway:** два сервиса из репо:
  - api — Start Command `npm run start --workspace=@astro/api`
  - bot — Start Command `npm run start --workspace=@astro/bot`
  - переменные — как в `.env.example`. Для PDF добавь build-шаг
    `npx puppeteer browsers install chrome`.

## Проверка после деплоя

```bash
curl https://<astro-api>/health   # покажет активные режимы (llm/astro/db/telegram)
```

Если PDF не генерируется (нет Chrome в окружении) — текст отчёта всё равно
доставляется в Telegram; PDF можно включить позже (Docker-образ с Chromium).

## Хочешь, чтобы я задеплоил сам?

Тогда дай мне на это окружение токен (Render API key или Railway token) — и я
прогоню деплой через их CLI. Это секрет: после запуска лучше его отозвать/ротейтнуть.
По умолчанию рекомендую Вариант A — он не требует передавать мне ключи.
