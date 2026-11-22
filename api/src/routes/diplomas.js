import { Router } from 'express';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { Diploma } from '../models/Diploma.js';
import { getBucket } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { config } from '../config.js';

const HASH_RE = /^[0-9a-f]{64}$/;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxPdfBytes, files: 1 } });

const publicView = (d) => ({
  hash: d.hash,
  nom: d.nom,
  prenom: d.prenom,
  filiere: d.filiere,
  annee: d.annee,
  issuedAt: d.createdAt,
  revokedAt: d.revokedAt || null,
  fileUrl: `/api/diplomas/${d.hash}/file`,
});

const adminView = (d) => ({ ...publicView(d), revoked: d.revoked, fileName: d.fileName, fileSize: d.fileSize, issuedBy: d.issuedBy });

const normHash = (h) => String(h || '').toLowerCase().replace(/^0x/, '');

// ---------- Public ----------
export const publicRouter = Router();

const verifyLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

// The browser hashes the PDF locally and only sends the 64-char fingerprint.
publicRouter.get('/verify/:hash', verifyLimiter, async (req, res) => {
  const hash = normHash(req.params.hash);
  if (!HASH_RE.test(hash)) return res.status(400).json({ error: 'Empreinte invalide.' });
  const d = await Diploma.findOne({ hash });
  if (!d) return res.json({ status: 'unknown' });
  res.json({ status: d.revoked ? 'revoked' : 'valid', diploma: publicView(d) });
});

publicRouter.get('/diplomas/:hash/file', verifyLimiter, async (req, res) => {
  const hash = normHash(req.params.hash);
  if (!HASH_RE.test(hash)) return res.status(400).json({ error: 'Empreinte invalide.' });
  const d = await Diploma.findOne({ hash });
  if (!d) return res.status(404).json({ error: 'Diplôme introuvable.' });
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Length': String(d.fileSize),
    'Content-Disposition': `inline; filename="${encodeURIComponent(d.fileName)}"`,
  });
  await pipeline(getBucket().openDownloadStream(d.fileId), res);
});

// ---------- Admin ----------
export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/', async (_req, res) => {
  const list = await Diploma.find().sort({ createdAt: -1 }).limit(500);
  res.json(list.map(adminView));
});

adminRouter.post('/', upload.single('file'), async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'Fichier PDF manquant.' });
  if (f.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return res.status(400).json({ error: 'Le fichier n’est pas un PDF valide.' });
  }

  // The server computes the hash itself: never trust one sent by the client.
  const hash = crypto.createHash('sha256').update(f.buffer).digest('hex');
  if (await Diploma.exists({ hash })) {
    return res.status(409).json({ error: 'Ce fichier est déjà enregistré.' });
  }

  const fields = {
    nom: req.body.nom,
    prenom: req.body.prenom,
    filiere: req.body.filiere,
    annee: Number(req.body.annee),
  };
  if (!fields.nom?.trim() || !fields.prenom?.trim() || !fields.filiere?.trim() || !(fields.annee > 1900)) {
    return res.status(400).json({ error: 'Nom, prénom, filière et année sont obligatoires.' });
  }

  const bucket = getBucket();
  const stream = bucket.openUploadStream(f.originalname, { contentType: 'application/pdf' });
  await pipeline(Readable.from(f.buffer), stream);

  try {
    const d = await Diploma.create({
      ...fields,
      hash,
      fileName: f.originalname,
      fileSize: f.size,
      fileId: stream.id,
      issuedBy: req.admin.email,
    });
    res.status(201).json(adminView(d));
  } catch (err) {
    await bucket.delete(stream.id).catch(() => {}); // do not leave an orphan file
    throw err;
  }
});

adminRouter.post('/:hash/revoke', async (req, res) => {
  const hash = normHash(req.params.hash);
  if (!HASH_RE.test(hash)) return res.status(400).json({ error: 'Empreinte invalide.' });
  const d = await Diploma.findOne({ hash });
  if (!d) return res.status(404).json({ error: 'Diplôme introuvable.' });
  if (d.revoked) return res.status(409).json({ error: 'Ce diplôme est déjà révoqué.' });
  d.revoked = true;
  d.revokedAt = new Date();
  await d.save();
  res.json(adminView(d));
});
