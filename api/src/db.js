import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { Admin } from './models/Admin.js';

let bucket;

// PDFs live in MongoDB itself (GridFS), so a single volume holds all the data.
export const getBucket = () => {
  if (!bucket) bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'diplomas' });
  return bucket;
};

export async function connectDb(uri = config.mongoUri) {
  // Mongo may still be starting when the container boots: retry for ~30 s.
  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      break;
    } catch (err) {
      if (attempt >= 10) throw err;
      console.log(`MongoDB indisponible (tentative ${attempt}/10), nouvel essai...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  bucket = undefined;
  await mongoose.syncIndexes();
}

// Create the university account from env vars on first start.
export async function seedAdmin() {
  const exists = await Admin.exists({ email: config.adminEmail });
  if (exists) return;
  const passwordHash = await bcrypt.hash(config.adminPassword, 10);
  try {
    await Admin.create({ email: config.adminEmail, passwordHash });
    console.log(`Compte administrateur créé : ${config.adminEmail}`);
  } catch (err) {
    // Several replicas start at once: another one may have created it first. Not an error.
    if (err.code !== 11000) throw err;
  }
}
