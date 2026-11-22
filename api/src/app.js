import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import multer from 'multer';
import authRouter from './routes/auth.js';
import { publicRouter, adminRouter } from './routes/diplomas.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind nginx / ingress: correct client IP for rate limiting
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));

  // Liveness/readiness probe (used by Docker healthcheck and Kubernetes).
  app.get('/api/health', (_req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'db-down', host: process.env.HOSTNAME || 'local' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', publicRouter);
  app.use('/api/diplomas', adminRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const text = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux.' : 'Envoi invalide.';
      return res.status(400).json({ error: text });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide.' });
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  });

  return app;
}
