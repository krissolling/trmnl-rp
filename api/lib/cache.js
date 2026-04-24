// Tiny filesystem JSON cache with TTL. Used to avoid re-scanning the 185+ Figma
// projects on every TRMNL poll.
//
// Write path is `data/cache/<key>.json` (relative to this file's parent). On
// Netlify Functions this needs to move to Netlify Blobs — not wired up yet.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // api/
const CACHE_DIR = join(ROOT, 'data', 'cache');

function safePath(key) {
  // Allow slashes in key for nesting (e.g. "project-files/123")
  const safe = key.replace(/\.\./g, '').replace(/[^a-zA-Z0-9/_-]/g, '_');
  return join(CACHE_DIR, `${safe}.json`);
}

export async function cacheGet(key) {
  try {
    const raw = await readFile(safePath(key), 'utf8');
    const { expires, data } = JSON.parse(raw);
    if (typeof expires === 'number' && expires < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export async function cacheSet(key, data, ttlSec) {
  const path = safePath(key);
  await mkdir(dirname(path), { recursive: true });
  const payload = { expires: Date.now() + ttlSec * 1000, data };
  await writeFile(path, JSON.stringify(payload));
}

// cacheGetOrSet(key, ttlSec, factory): returns cached value or runs factory and caches result.
export async function cacheGetOrSet(key, ttlSec, factory) {
  const hit = await cacheGet(key);
  if (hit !== null) return hit;
  const fresh = await factory();
  await cacheSet(key, fresh, ttlSec);
  return fresh;
}
