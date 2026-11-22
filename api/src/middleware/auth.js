import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const signToken = (admin) =>
  jwt.sign({ sub: String(admin._id), email: admin.email }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  });

export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise.' });
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.admin = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'Session expirée ou invalide.' });
  }
}
