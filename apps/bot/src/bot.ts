import { Telegraf, Markup } from 'telegraf';
import { env } from '@astro/core';

if (!env.telegramBotToken) {
  console.error('[bot] TELEGRAM_BOT_TOKEN is not set — the bot cannot start. Set it in .env.');
  process.exit(1);
}

const bot = new Telegraf(env.telegramBotToken);

const openAppKeyboard = Markup.inlineKeyboard([
  [Markup.button.webApp('🔮 Открыть Astro Map', env.webappUrl)],
]);

// /start (plan §3) — create the entry point and show the Mini App button.
bot.start(async (ctx) => {
  await ctx.reply(
    'Привет. Я построю твою натальную карту по дате, времени и месту рождения, ' +
      'а AI расшифрует её как карту энергии, денег, отношений и текущего периода.',
    openAppKeyboard,
  );
});

bot.command('report', async (ctx) => {
  await ctx.reply('Открой Astro Map, заполни данные рождения и получи разбор:', openAppKeyboard);
});

bot.command('support', async (ctx) => {
  await ctx.reply('Поддержка: напиши сюда свой вопрос — мы ответим. Для разбора нажми кнопку ниже.', openAppKeyboard);
});

// Upsell buttons sent with the finished report.
bot.action('upsell_expert', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    'Живой разбор 60 минут: мы пройдём карту, найдём ключевые точки напряжения и соберём ' +
      'конкретный план на 30–90 дней. Напиши «Хочу разбор» — и мы согласуем время.',
  );
});
bot.action('upsell_compat', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Совместимость пары: пришли данные рождения партнёра, и мы соберём отдельный разбор.');
});
bot.action('upsell_transits', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Еженедельные транзиты: будем присылать персональный прогноз каждую неделю. Напиши «Транзиты», чтобы подключить.');
});

bot.launch().then(() => console.log('[bot] launched'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
