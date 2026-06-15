import { Router } from 'express';
import { authenticate } from '../auth';

export const authRouter = Router();

// POST /auth/telegram — validate initData, upsert the user.
authRouter.post('/auth/telegram', async (req, res) => {
  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'invalid initData' });
  res.json({ user });
});
