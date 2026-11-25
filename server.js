import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import fs from 'node:fs';
import https from 'node:https';
import { getGpvSchedule } from './server/gpv.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const GPV_MAX_AGE_S = 60;
const ASSET_MAX_AGE_S = 365 * 24 * 60 * 60;

app.get('/gpv', async (_req, res) => {
  const schedule = await getGpvSchedule();
  if (!schedule) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ error: 'schedule unavailable' });
    return;
  }
  res.setHeader('Cache-Control', `public, max-age=${GPV_MAX_AGE_S}`);
  res.json(schedule);
});

app.use('/api-proxy', createProxyMiddleware({
  target: 'https://power-api.loe.lviv.ua/api',
  changeOrigin: true,
  pathRewrite: {
    '^/api-proxy': '',
  },
}));

const DIST = path.join(__dirname, 'dist');

// Hashed build files never change; the page and the service worker must revalidate.
app.use(express.static(DIST, {
  setHeaders: (res, file) => {
    const immutable = file.startsWith(path.join(DIST, 'assets'));
    res.setHeader('Cache-Control', immutable ? `public, max-age=${ASSET_MAX_AGE_S}, immutable` : 'no-cache');
  },
}));

// A missing build file is a 404, not the page: an old page asking for a removed
// chunk must fail loudly instead of parsing HTML as JavaScript.
app.use('/assets', (_req, res) => {
  res.status(404).end();
});

app.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(DIST, 'index.html'));
});

// HOST and TLS_KEY/TLS_CERT serve a local review build, for example on a VPN
// address over HTTPS so geolocation works. Production sits behind Caddy on HTTP.
const start = () => {
  if (process.env.TLS_KEY && process.env.TLS_CERT) {
    https.createServer({ key: fs.readFileSync(process.env.TLS_KEY), cert: fs.readFileSync(process.env.TLS_CERT) }, app)
      .listen(PORT, HOST, () => console.log(`HTTPS server is running on ${HOST}:${PORT}`));
  } else {
    app.listen(PORT, HOST, () => console.log(`Server is running on ${HOST}:${PORT}`));
  }
};
start();
