// Node HTTP server. Run: `npm run dev` (or `npm start` in prod).
// Serves: GET /api/figma-week (the TRMNL payload), GET / (health check),
// and static files from ./public (fonts, index.html).

import { createServer } from 'node:http';
import { readFile, readFileSync, stat, existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { getPayload } from './lib/handler.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const readFileAsync = promisify(readFile);
const statAsync = promisify(stat);

// Lightweight .env loader — only runs if .env exists (dev).
function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

async function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0];
  // Prevent path traversal by resolving inside PUBLIC_DIR and checking prefix
  const requested = resolve(PUBLIC_DIR, '.' + urlPath);
  if (!requested.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end(); return true;
  }
  let filePath = requested;
  try {
    const st = await statAsync(filePath);
    if (st.isDirectory()) filePath = join(filePath, 'index.html');
    const data = await readFileAsync(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  // Health check — fast, no Figma call
  if (req.url === '/healthz' || req.url === '/') {
    if (await serveStatic(req, res)) return;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // The TRMNL payload
  if (req.url === '/api/figma-week' || req.url.startsWith('/api/figma-week?')) {
    try {
      const data = await getPayload();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60'
      });
      res.end(JSON.stringify(data, null, 2));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Static files (fonts, etc.)
  if (req.method === 'GET' && await serveStatic(req, res)) return;

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  const mode = process.env.FIGMA_TOKEN && process.env.MOCK !== '1' ? 'LIVE' : 'MOCK';
  console.log(`figma-week api [${mode}] → http://${HOST}:${PORT}/api/figma-week`);
});
