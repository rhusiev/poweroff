import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
