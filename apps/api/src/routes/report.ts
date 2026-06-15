import { Router } from 'express';
import { getRepo, getLocalPdf, processPaidOrder } from '@astro/core';

export const reportRouter = Router();

// POST /report/generate — manual / internal trigger (admin or retry).
reportRouter.post('/report/generate', async (req, res) => {
  const { order_id } = req.body ?? {};
  if (!order_id) return res.status(400).json({ error: 'order_id required' });
  try {
    await processPaidOrder(order_id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[report/generate]', err);
    res.status(500).json({ error: 'generation failed' });
  }
});

// GET /report/:id — report JSON consumed by the Mini App report page + PDF print.
reportRouter.get('/report/:id', async (req, res) => {
  const report = await getRepo().getReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'not found' });
  res.json({ report });
});

// GET /report/:id/pdf — serve the generated PDF (dev in-memory fallback).
reportRouter.get('/report/:id/pdf', async (req, res) => {
  const pdf = getLocalPdf(req.params.id);
  if (!pdf) return res.status(404).json({ error: 'pdf not ready' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="astro-map-${req.params.id}.pdf"`);
  res.send(pdf);
});
