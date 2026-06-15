import { Router } from 'express';
import { getRepo, generatePreview } from '@astro/core';
import { authenticate } from '../auth';

export const astroRouter = Router();

// POST /astro/preview — generate the free teaser from the latest birth profile.
astroRouter.post('/astro/preview', async (req, res) => {
  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'invalid initData' });

  const profile = await getRepo().getLatestBirthProfile(user.id);
  if (!profile) return res.status(404).json({ error: 'no birth profile yet' });

  try {
    const { report, teaserText } = await generatePreview(profile);
    res.json({ teaser_text: teaserText, report });
  } catch (err) {
    console.error('[astro/preview]', err);
    res.status(500).json({ error: 'preview failed' });
  }
});
