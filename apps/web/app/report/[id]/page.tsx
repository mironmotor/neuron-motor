'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import { api } from '../../../lib/api';
import ReportPage from '../../../components/ReportPage';
import type { ReportJson } from '../../../lib/types';

// Renders the full report. Puppeteer opens this with ?print=true to print a PDF.
export default function ReportView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [report, setReport] = useState<ReportJson | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getReport(id)
      .then((row) => {
        if (row.report_json) setReport(row.report_json);
        else setError('Отчёт ещё готовится…');
      })
      .catch(() => setError('Отчёт не найден'));
  }, [id]);

  if (error) return <main className="screen"><p className="muted">{error}</p></main>;
  if (!report) return <main className="screen"><div className="spinner" /></main>;

  return <ReportPage report={report} />;
}
