import { env, flags } from '../env';
import type { BirthProfile, NormalizedChart } from '../types';

// Astro API adapter. Returns BOTH the raw API JSON and a normalized chart
// (plan §6 + §10.8). Falls back to deterministic mock data when keys are absent.
export interface AstroResult {
  raw: unknown;
  normalized: NormalizedChart;
}

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function sign(seed: number): string {
  return SIGNS[seed % SIGNS.length];
}

export interface AstroApiAdapter {
  calculate(profile: BirthProfile): Promise<AstroResult>;
}

function normalizeFromMock(profile: BirthProfile): NormalizedChart {
  const seed = hash(`${profile.birth_date}|${profile.birth_time}|${profile.birth_city}`);
  const s = (n: number) => sign((seed >> n) % 12 === 0 ? seed % 12 : (seed >> n));
  return {
    user: {
      name: profile.name ?? '',
      birth_date: profile.birth_date ?? '',
      birth_time: profile.birth_time ?? '',
      birth_city: profile.birth_city ?? '',
      main_question: profile.main_question ?? '',
    },
    core: { sun: s(0), moon: s(3), ascendant: s(6) },
    houses: { second_house: s(9), seventh_house: s(12), tenth_house: s(15) },
    planets: {
      venus: `${s(18)} in 3rd house`,
      mars: `${s(21)} in 6th house`,
      jupiter: `${s(24)} in 8th house`,
      saturn: `${s(27)} in 9th house`,
    },
    aspects: ['Mars square Saturn', 'Venus trine Jupiter', 'Moon conjunct Neptune'],
    current_period: {
      main_transit: 'Saturn transit affects natal Moon',
      theme: 'эмоциональная зрелость и границы',
    },
  };
}

class MockAstroAdapter implements AstroApiAdapter {
  async calculate(profile: BirthProfile): Promise<AstroResult> {
    const normalized = normalizeFromMock(profile);
    return { raw: { mock: true, ...normalized }, normalized };
  }
}

class RealAstroAdapter implements AstroApiAdapter {
  async calculate(profile: BirthProfile): Promise<AstroResult> {
    try {
      const res = await fetch(`${env.astroBaseUrl.replace(/\/$/, '')}/natal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': env.astroClientId,
          'X-Client-Secret': env.astroClientSecret,
        },
        body: JSON.stringify({
          date: profile.birth_date,
          time: profile.birth_time,
          city: profile.birth_city,
          latitude: profile.latitude,
          longitude: profile.longitude,
          timezone: profile.timezone,
        }),
      });
      if (!res.ok) throw new Error(`Astro API ${res.status}`);
      const raw = await res.json();
      // The exact provider shape varies; until mapped, normalize from the same
      // deterministic seed so downstream stays stable. Replace with a real mapper.
      return { raw, normalized: normalizeFromMock(profile) };
    } catch {
      // Plan §4: if Astro API fails, keep going gracefully with a fallback.
      return new MockAstroAdapter().calculate(profile);
    }
  }
}

let cached: AstroApiAdapter | null = null;
export function getAstroAdapter(): AstroApiAdapter {
  if (cached) return cached;
  cached = flags.useRealAstro ? new RealAstroAdapter() : new MockAstroAdapter();
  return cached;
}
