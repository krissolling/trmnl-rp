// One-shot cache warmer: `node scripts/warm.js`
// Reads FIGMA_TOKEN / FIGMA_TEAM_ID from api/.env and walks every project,
// caching file listings to data/cache/ so subsequent requests are fast.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { warmCache } from '../lib/figma.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

const t0 = Date.now();
const n = await warmCache(process.env.FIGMA_TOKEN, process.env.FIGMA_TEAM_ID);
console.log(`Warmed ${n} projects in ${Math.round((Date.now() - t0) / 1000)}s`);
