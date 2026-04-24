// Diagnostic: count files touched in this-week + last-week across cached projects.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { weekBounds } from '../lib/week.js';

const CACHE_DIR = join(dirname(dirname(fileURLToPath(import.meta.url))), 'data', 'cache', 'project-files');
const { thisStart, thisEnd, lastStart, lastEnd } = weekBounds(new Date());

const files = (await readdir(CACHE_DIR)).filter(f => f.endsWith('.json'));
let allFiles = [];
for (const f of files) {
  try {
    const { data } = JSON.parse(await readFile(join(CACHE_DIR, f), 'utf8'));
    allFiles.push(...data);
  } catch {}
}

const inThis = allFiles.filter(f => new Date(f.last_modified) >= thisStart && new Date(f.last_modified) < thisEnd);
const inLast = allFiles.filter(f => new Date(f.last_modified) >= lastStart && new Date(f.last_modified) < lastEnd);

console.log(`Total files cached: ${allFiles.length}`);
console.log(`This week (${thisStart.toISOString().slice(0,10)} → ${thisEnd.toISOString().slice(0,10)}): ${inThis.length}`);
console.log(`Last week (${lastStart.toISOString().slice(0,10)} → ${lastEnd.toISOString().slice(0,10)}): ${inLast.length}`);
console.log(`\nSamples (this week):`);
inThis.slice(0, 10).forEach(f => console.log(`  ${f.last_modified}  ${f.name}`));
console.log(`\nAPI calls needed: ${(inThis.length + inLast.length) * 2} (versions + comments per file)`);
