import { Router } from 'express';
import { getRepo } from '@astro/core';
import { authenticate } from '../auth';

export const profileRouter = Router();

// POST /profile/create — save birth data + the main question (plan step 3).
profileRouter.post('/profile/create', async (req, res) => {
  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'invalid initData' });

  const { name, birth_date, birth_time, birth_city, timezone, latitude, longitude, main_question } = req.body ?? {};
  if (!birth_date || !birth_city) {
    return res.status(400).json({ error: 'birth_date and birth_city are required' });
  }

  const profile = await getRepo().createBirthProfile({
    user_id: user.id,
    name,
    birth_date,
    birth_time: birth_time || null,
    birth_city,
    timezone: timezone || null,
    latitude: latitude != null ? Number(latitude) : null,
    longitude: longitude != null ? Number(longitude) : null,
    main_question: main_question || null,
  });

  res.json({ profile, approximate_time: !birth_time });
});
