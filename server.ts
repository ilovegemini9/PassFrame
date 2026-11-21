import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildRobotsTxt,
  buildSitemapXml,
  injectSeoIntoHtml,
  resolveRouteSeo,
} from './src/utils/seo.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveBaseUrl(req: express.Request): string {
  const configured = process.env.APP_URL;
  if (configured && configured !== 'MY_APP_URL') {
    return configured.replace(/\/+$/, '');
  }
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

async function startServer() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT) || 3000;

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = resolveBaseUrl(req);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buildSitemapXml(baseUrl));
  });

  app.get('/robots.txt', (req, res) => {
    const baseUrl = resolveBaseUrl(req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buildRobotsTxt(baseUrl));
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });

    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const templatePath = path.resolve(__dirname, 'index.html');
        const rawTemplate = fs.readFileSync(templatePath, 'utf-8');
        const transformed = await vite.transformIndexHtml(url, rawTemplate);
        const seo = resolveRouteSeo(url, resolveBaseUrl(req));
        const finalHtml = injectSeoIntoHtml(transformed, seo);
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(finalHtml);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const distIndex = path.resolve(distDir, 'index.html');

    app.use(express.static(distDir, { index: false }));

    app.get('*', (req, res) => {
      const rawHtml = fs.readFileSync(distIndex, 'utf-8');
      const seo = resolveRouteSeo(req.originalUrl, resolveBaseUrl(req));
      const finalHtml = injectSeoIntoHtml(rawHtml, seo);
      res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(finalHtml);
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`PassFrame server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
