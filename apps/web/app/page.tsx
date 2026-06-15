'use client';

import { useEffect, useState } from 'react';
import { api, type BirthForm } from '../lib/api';
import { getWebApp, openExternal } from '../lib/telegram';
import type { ReportJson } from '../lib/types';

type Screen = 'main' | 'form' | 'teaser' | 'status';

export default function Home() {
  const [screen, setScreen] = useState<Screen>('main');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [teaser, setTeaser] = useState<{ text: string; report: ReportJson } | null>(null);
  const [form, setForm] = useState<BirthForm>({ name: '', birth_date: '', birth_time: '', birth_city: '', main_question: '' });

  useEffect(() => {
    const wa = getWebApp();
    wa?.ready();
    wa?.expand();
    api.auth().catch(() => {/* dev fallback handles auth */});
  }, []);

  const update = (k: keyof BirthForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submitForm() {
    setError('');
    if (!form.name || !form.birth_date || !form.birth_city) {
      setError('Заполни имя, дату и город рождения.');
      return;
    }
    setLoading(true);
    try {
      await api.createProfile(form);
      const t = await api.preview();
      setTeaser({ text: t.teaser_text, report: t.report });
      setScreen('teaser');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Что-то пошло не так');
    } finally {
      setLoading(false);
    }
  }

  async function pay() {
    setError('');
    setLoading(true);
    try {
      const { payment_url } = await api.checkout();
      openExternal(payment_url);
      setScreen('status');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать оплату');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="screen">
      {screen === 'main' && (
        <>
          <h1>🔮 AI-натальная карта</h1>
          <p className="muted">
            Построю твою карту по дате, времени и месту рождения, а AI расшифрует её: личность,
            деньги, отношения, предназначение, текущий период и миссию на 7 дней.
          </p>
          <div className="card">
            <h2>Что ты получишь</h2>
            <p>Красивый разбор в Telegram + PDF-файл. Сначала — бесплатный тизер.</p>
          </div>
          <button className="btn-primary" onClick={() => setScreen('form')}>Построить карту</button>
        </>
      )}

      {screen === 'form' && (
        <>
          <h1>Данные рождения</h1>
          <p className="muted">Чем точнее время, тем точнее дома и асцендент.</p>
          <label>Имя</label>
          <input value={form.name} onChange={update('name')} placeholder="Анна" />
          <label>Дата рождения</label>
          <input type="date" value={form.birth_date} onChange={update('birth_date')} />
          <label>Точное время (если знаешь)</label>
          <input type="time" value={form.birth_time} onChange={update('birth_time')} />
          <label>Город рождения</label>
          <input value={form.birth_city} onChange={update('birth_city')} placeholder="Москва" />
          <label>Главный вопрос</label>
          <textarea value={form.main_question} onChange={update('main_question')} placeholder="Деньги и предназначение" />
          {error && <p className="error">{error}</p>}
          <button className="btn-primary" disabled={loading} onClick={submitForm}>
            {loading ? 'Считаем карту…' : 'Получить бесплатный тизер'}
          </button>
        </>
      )}

      {screen === 'teaser' && teaser && (
        <>
          <h1>{teaser.report.title}</h1>
          <p className="subtitle muted">{teaser.report.subtitle}</p>
          <div className="card">
            <p className="teaser">{teaser.text}</p>
          </div>
          <div className="card">
            <h2>Полный AI-разбор</h2>
            <p className="muted">Все 9 разделов, миссия на 7 дней и PDF-файл.</p>
            <p className="price">990 ₽</p>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn-primary" disabled={loading} onClick={pay}>
            {loading ? 'Открываем оплату…' : 'Получить полный отчёт'}
          </button>
          <button className="btn-ghost" onClick={() => setScreen('main')}>Назад</button>
        </>
      )}

      {screen === 'status' && (
        <>
          <h1>Оплата принята ✨</h1>
          <div className="spinner" />
          <p className="muted" style={{ textAlign: 'center' }}>
            Я уже собираю твой отчёт. Когда карта будет готова, пришлю её прямо в Telegram —
            полный разбор и PDF-файл.
          </p>
          <button className="btn-ghost" onClick={() => setScreen('main')}>На главную</button>
        </>
      )}
    </main>
  );
}
