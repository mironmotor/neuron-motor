import { env } from './env';

// Generate a PDF by printing the live report page with a headless browser
// (plan §7: AI report_json → React ReportPage → /report/:id?print=true → PDF).
export async function generateReportPdf(reportId: string): Promise<Buffer> {
  // Lazy import so apps that never generate PDFs don't pay the puppeteer cost.
  const puppeteer = (await import('puppeteer')).default;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const url = `${env.webappUrl.replace(/\/$/, '')}/report/${reportId}?print=true`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 });
    await page.emulateMediaType('screen');
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
