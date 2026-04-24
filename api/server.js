// Local dev server. Run: `npm run dev` then point trmnlp at http://localhost:PORT/api/figma-week.

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { getPayload } from './lib/handler.js';

// Lightweight .env loader — no dotenv dep.
function loadEnv() {
  const path = new URL('./.env', import.meta.url);
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

const server = createServer(async (req, res) => {
  if (req.url === '/api/figma-week' || req.url === '/') {
    try {
      const data = await getPayload();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify(data, null, 2));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  const mode = process.env.FIGMA_TOKEN && process.env.MOCK !== '1' ? 'LIVE' : 'MOCK';
  console.log(`figma-week api [${mode}] → http://localhost:${PORT}/api/figma-week`);
});
