import { getRepo } from '../db';
import { getAstroAdapter } from '../adapters/astro';
import { getLlmAdapter } from '../adapters/llm';
import { generateReportPdf } from '../pdf';
import { putPdf } from '../storage';
import { sendMessage, sendDocument, inlineKeyboard } from '../telegram';
import { env } from '../env';
import type { BirthProfile, ReportJson } from '../types';

// Flatten the structured report into a Telegram-friendly text block.
export function reportToText(r: ReportJson, full: boolean): string {
  const head = `<b>${r.title}</b>\n<i>${r.subtitle}</i>\n`;
  const sections = (full ? r.sections : r.sections.slice(0, 3))
    .map((s) => `\n<b>${s.title}</b>\n${s.body}`)
    .join('\n');
  const plan = full && r.seven_day_plan.length ? `\n\n<b>Миссия на 7 дней</b>\n${r.seven_day_plan.map((p) => `• ${p}`).join('\n')}` : '';
  return `${head}${sections}${plan}`.trim();
}

// ─── Free teaser (plan steps 4–5): astro preview → AI preview_report ───
export async function generatePreview(profile: BirthProfile): Promise<{ report: ReportJson; teaserText: string }> {
  const astro = await getAstroAdapter().calculate(profile);
  const report = await getLlmAdapter().generateReport(astro.normalized, 'preview_report');
  return { report, teaserText: reportToText(report, false) };
}

// ─── Paid-order pipeline (plan §4 webhook steps 7–12) ───
// astro → AI full report → persist → PDF → Telegram message + PDF + upsell.
export async function processPaidOrder(orderId: string): Promise<void> {
  const repo = getRepo();
  const order = await repo.getOrder(orderId);
  if (!order) throw new Error(`order ${orderId} not found`);

  const profile = await repo.getLatestBirthProfile(order.user_id);
  if (!profile) throw new Error(`no birth profile for order ${orderId}`);

  const user = await repo.getUserById(order.user_id);
  if (!user) throw new Error(`no user for order ${orderId}`);
  const chatId = user.telegram_id;

  // 1) Astro calculation
  await repo.updateOrder(orderId, { status: 'astro_calculated' });
  const astro = await getAstroAdapter().calculate(profile);
  await repo.createAstroCalculation({
    user_id: order.user_id,
    birth_profile_id: profile.id,
    raw_api_json: astro.raw,
    normalized_json: astro.normalized,
  });

  // 2) AI full report
  await repo.updateOrder(orderId, { status: 'report_generating' });
  const reportJson = await getLlmAdapter().generateReport(astro.normalized, 'full_report');
  const fullText = reportToText(reportJson, true);

  const report = await repo.createReport({
    user_id: order.user_id,
    birth_profile_id: profile.id,
    order_id: orderId,
    report_json: reportJson,
    teaser_text: reportToText(reportJson, false),
    full_text: fullText,
    status: 'report_ready',
  });
  await repo.updateOrder(orderId, { status: 'report_ready' });

  // 3) Deliver. Send the text first so the user gets value even if the PDF
  //    step fails (plan §4 graceful degradation).
  await sendMessage(chatId, `Твоя Astro Map готова. Ниже полный разбор и PDF-файл.\n\n${truncate(fullText, 3500)}`);

  // 4) PDF
  let pdfUrl: string | null = null;
  try {
    await repo.updateReport(report.id, { status: 'pdf_generating' });
    const pdf = await generateReportPdf(report.id);
    pdfUrl = await putPdf(report.id, pdf);
    await repo.updateReport(report.id, { status: 'pdf_ready', pdf_url: pdfUrl, html_url: `${env.webappUrl.replace(/\/$/, '')}/report/${report.id}` });
    await sendDocument(
      chatId,
      pdf,
      `astro-map-${report.id}.pdf`,
      'Полный разбор в PDF 📄',
      upsellKeyboard(),
    );
  } catch (err) {
    console.error('[pipeline] PDF generation failed; text already delivered', err);
    await sendMessage(chatId, 'PDF догенерируем чуть позже — он придёт отдельным сообщением.', upsellKeyboard());
  }

  await repo.updateReport(report.id, { status: 'report_sent' });
  await repo.updateOrder(orderId, { status: 'report_sent' });
}

function upsellKeyboard() {
  return inlineKeyboard([
    [{ text: '🧑‍🏫 Разобрать с экспертом', callback_data: 'upsell_expert' }],
    [{ text: '💞 Совместимость пары', callback_data: 'upsell_compat' }],
    [{ text: '📅 Транзиты каждую неделю', callback_data: 'upsell_transits' }],
  ]);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
