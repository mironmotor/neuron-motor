import { createClient } from '@supabase/supabase-js';
import { env, flags } from './env';

// PDF storage: Supabase Storage when configured, otherwise an in-process map
// (dev only) served back by the API at /report/:id/pdf.
const memory = new Map<string, Buffer>();

export async function putPdf(reportId: string, pdf: Buffer): Promise<string> {
  if (flags.useSupabase) {
    const db = createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false } });
    const path = `${reportId}.pdf`;
    const { error } = await db.storage.from(env.pdfStorageBucket).upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    const { data } = db.storage.from(env.pdfStorageBucket).getPublicUrl(path);
    return data.publicUrl;
  }
  memory.set(reportId, pdf);
  return `${env.backendUrl.replace(/\/$/, '')}/report/${reportId}/pdf`;
}

export function getLocalPdf(reportId: string): Buffer | null {
  return memory.get(reportId) ?? null;
}
