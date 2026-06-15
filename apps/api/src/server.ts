import express from 'express';
import cors from 'cors';
import { env, flags } from '@astro/core';
import { authRouter } from './routes/auth';
import { profileRouter } from './routes/profile';
import { astroRouter } from './routes/astro';
import { paymentsRouter, webhookRouter } from './routes/payments';
import { reportRouter } from './routes/report';

const app = express();
app.use(cors({ origin: true }));

// The Tribute webhook needs the raw body for HMAC verification, so it is
// mounted BEFORE express.json() (which would otherwise consume the stream).
app.use(webhookRouter);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) =>
  res.json({
    ok: true,
    mode: {
      supabase: flags.useSupabase,
      astro: flags.useRealAstro ? 'real' : 'mock',
      llm: flags.useRealLlm ? env.llmProvider : 'mock',
      telegram: flags.useRealTelegram ? 'real' : 'mock',
    },
  }),
);

app.use(authRouter);
app.use(profileRouter);
app.use(astroRouter);
app.use(paymentsRouter);
app.use(reportRouter);

app.listen(env.port, () => {
  console.log(`[api] listening on :${env.port}`);
  console.log(
    `[api] modes — db:${flags.useSupabase ? 'supabase' : 'memory'} astro:${flags.useRealAstro ? 'real' : 'mock'} llm:${flags.useRealLlm ? env.llmProvider : 'mock'} telegram:${flags.useRealTelegram ? 'real' : 'mock'}`,
  );
});
