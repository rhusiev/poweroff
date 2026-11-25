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

app.get('/gpv', async (_req, res) => {
  const schedule = await getGpvSchedule();
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(schedule);
});

app.use('/api-proxy', createProxyMiddleware({
  target: 'https://power-api.loe.lviv.ua/api',
  changeOrigin: true,
  pathRewrite: {
    '^/api-proxy': '',
  },
  onProxyRes: function (proxyRes, req, res) {
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
  }
}));

app.use(express.static(path.join(__dirname, 'dist')));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const start = () => {
  if (process.env.TLS_KEY && process.env.TLS_CERT) {
    https.createServer({ key: fs.readFileSync(process.env.TLS_KEY), cert: fs.readFileSync(process.env.TLS_CERT) }, app)
      .listen(PORT, HOST, () => console.log(`HTTPS server is running on ${HOST}:${PORT}`));
  } else {
    app.listen(PORT, HOST, () => console.log(`Server is running on ${HOST}:${PORT}`));
  }
};
start();
