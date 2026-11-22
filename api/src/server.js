import mongoose from 'mongoose';
import { config } from './config.js';
import { connectDb, seedAdmin } from './db.js';
import { createApp } from './app.js';

await connectDb();
await seedAdmin();

const server = createApp().listen(config.port, () => console.log(`API prête sur le port ${config.port}`));

// Graceful shutdown: lets Docker / Kubernetes stop the container cleanly.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  });
}
