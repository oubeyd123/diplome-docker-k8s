import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { Admin } from '../models/Admin.js';
import { signToken, requireAdmin } from '../middleware/auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans quelques minutes.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');
  const admin = email && (await Admin.findOne({ email }));
  const ok = admin && (await bcrypt.compare(password, admin.passwordHash));
  if (!ok) return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  res.json({ token: signToken(admin), email: admin.email });
});

router.get('/me', requireAdmin, (req, res) => res.json({ email: req.admin.email }));

export default router;
