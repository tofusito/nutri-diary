import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { MongoClient } from 'mongodb';
import { createApp, ensureIndexes } from './app.js';

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || '127.0.0.1';
const client = new MongoClient(mongoUrl);

try {
  await client.connect();
  await ensureIndexes(client);
  const app = createApp(client);
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  app.use(express.static(dist));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(dist, 'index.html'), (error) => error && next());
  });
  const server = app.listen(port, host, () => console.log(`Nutri Diary listening on http://${host}:${port}`));
  const close = async () => { server.close(); await client.close(); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
} catch (error) {
  console.error('Unable to start server:', error.message);
  await client.close().catch(() => {});
  process.exitCode = 1;
}
