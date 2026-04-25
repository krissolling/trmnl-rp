// Figma REST API client with layered caching.
// Docs: https://www.figma.com/developers/api
//
// Layers (biggest-win first):
//
//   L1. Full aggregated response        — cached in handler.js (30 min TTL)
//   L2. Per-file versions               — keyed by `fileKey.last_modified`.
//       Since Figma updates last_modified on any file edit, the key auto-
//       invalidates. Means: if a file hasn't changed since last poll, zero
//       Figma calls for it. Huge win for the many files touched early in the
//       week and left alone after.
//   L3. Per-file comments               — 30 min TTL (comments don't change
//       last_modified, so we can't key off that).
//   L4. Per-project file listings       — 12h TTL (existing, see cache.js).
//
// We also combine this-week + last-week into a single scan over the 14-day
// union, so we don't make duplicate API calls for files touched in both weeks
// and don't run two concurrency pools in parallel fighting the rate limiter.

import { cacheGetOrSet, cacheGet, cacheSet } from './cache.js';

const FIGMA_API = 'https://api.figma.com/v1';
// Project list / project-files TTLs are very long because the polling endpoint
// must NEVER trigger a 185-project rescan in-band — Figma rate-limits and the
// request times out. The background warmer (server.js) refreshes these on a
// 12h schedule. New files added to a project show up at the next warm cycle.
const PROJECTS_TTL = 30 * 24 * 3600;     // team project list — 30 days
const PROJECT_FILES_TTL = 30 * 24 * 3600; // per-project file list — 30 days
const COMMENTS_TTL = 30 * 60;            // per-file comments
const VERSIONS_TTL = 365 * 24 * 3600;    // per-file versions (auto-invalidates via key)
const PROJECT_FILES_DELAY_MS = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function figmaGet(path, token, attempt = 0) {
  const res = await fetch(`${FIGMA_API}${path}`, {
    headers: { 'X-Figma-Token': token }
  });
  if (res.status === 429 && attempt < 4) {
    const retryAfter = Number(res.headers.get('retry-after')) || 0;
    const wait = Math.max(retryAfter * 1000, 800 * 2 ** attempt);
    await sleep(wait);
    return figmaGet(path, token, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Figma ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let idx = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = idx++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }
  );
  await Promise.all(workers);
  return out;
}

const tsInRange = (dateStr, start, end) => {
  const t = new Date(dateStr).getTime();
  return t >= start.getTime() && t < end.getTime();
};

// Sanitize last_modified into a filesystem-friendly cache key suffix.
const lmKey = (lm) => String(lm).replace(/[^0-9TZ-]/g, '_');

async function getProjects(token, teamId) {
  return cacheGetOrSet(`team/${teamId}/projects`, PROJECTS_TTL, async () => {
    const { projects = [] } = await figmaGet(`/teams/${teamId}/projects`, token);
    return projects;
  });
}

async function getProjectFiles(token, projectId) {
  return cacheGetOrSet(`project-files/${projectId}`, PROJECT_FILES_TTL, async () => {
    const { files = [] } = await figmaGet(`/projects/${projectId}/files`, token);
    return files.map((f) => ({
      key: f.key,
      name: f.name,
      last_modified: f.last_modified,
      project_id: projectId
    }));
  });
}

// L2: per-file versions, keyed by last_modified → self-invalidating.
async function getFileVersions(token, fileKey, lastModified) {
  return cacheGetOrSet(
    `file-versions/${fileKey}.${lmKey(lastModified)}`,
    VERSIONS_TTL,
    async () => {
      const resp = await figmaGet(`/files/${fileKey}/versions`, token).catch(() => ({
        versions: [],
        pagination: {}
      }));
      const versionsList = (resp.versions || []).map((v) => ({
        created_at: v.created_at,
        label: v.label || ''
      }));
      // Figma's first page always sets prev_page even when the file has fewer
      // versions than the default page size (30) — so prev_page can't be used
      // to detect "we've seen all history". Trust the count instead: a partial
      // page (under 30) means we have the whole history.
      return {
        versions: versionsList,
        full_history: versionsList.length > 0 && versionsList.length < 30
      };
    }
  );
}

// L3: per-file comments, 30 min TTL.
async function getFileComments(token, fileKey) {
  return cacheGetOrSet(`file-comments/${fileKey}`, COMMENTS_TTL, async () => {
    const resp = await figmaGet(`/files/${fileKey}/comments`, token).catch(() => ({
      comments: []
    }));
    return (resp.comments || []).map((c) => ({ created_at: c.created_at }));
  });
}

// Main: one scan, aggregate both this-week and last-week from the same data.
// Returns { this: {...aggregate}, last: {...aggregate} }.
export async function fetchTwoWeeksData(token, teamId, thisStart, thisEnd, lastStart, lastEnd) {
  // 1. Projects (cached 24h)
  const projects = await getProjects(token, teamId);

  // 2. Files per project — cached, serial on cache miss to respect rate limit
  const allFiles = [];
  for (const p of projects) {
    const cached = await cacheGet(`project-files/${p.id}`);
    if (cached !== null) {
      allFiles.push(...cached);
      continue;
    }
    const files = await getProjectFiles(token, p.id);
    allFiles.push(...files);
    await sleep(PROJECT_FILES_DELAY_MS);
  }

  // 3. Filter to the 14-day union
  const unionStart = lastStart;
  const unionEnd = thisEnd;
  const touched = allFiles.filter((f) => tsInRange(f.last_modified, unionStart, unionEnd));

  if (touched.length === 0) {
    const empty = { projects: 0, files: 0, new_files: 0, versions: 0, comments: 0 };
    return { this: { ...empty }, last: { ...empty } };
  }

  // 4. Versions + comments for every touched file (parallel, bounded, cached).
  //    L2 versions cache auto-invalidates on last_modified change → repeat polls
  //    usually only hit the network for files edited since the last poll.
  const perFile = await mapPool(touched, 4, async (f) => {
    const [{ versions, full_history }, comments] = await Promise.all([
      getFileVersions(token, f.key, f.last_modified),
      getFileComments(token, f.key)
    ]);

    // For each week window, count named versions + comments within that range
    const count = (items, getTs, start, end) =>
      items.reduce((acc, it) => (tsInRange(getTs(it), start, end) ? acc + 1 : acc), 0);

    const namedThis = versions.filter((v) => v.label && v.label.trim() && tsInRange(v.created_at, thisStart, thisEnd)).length;
    const namedLast = versions.filter((v) => v.label && v.label.trim() && tsInRange(v.created_at, lastStart, lastEnd)).length;
    const commThis = count(comments, (c) => c.created_at, thisStart, thisEnd);
    const commLast = count(comments, (c) => c.created_at, lastStart, lastEnd);

    // New-file heuristic: a file is "new this week" iff its full version
    // history fits on one Figma page AND the earliest known version is in the
    // window. (Mature files have hundreds of versions and never qualify.)
    const earliest = versions[versions.length - 1];
    const isNewThis = full_history && earliest && tsInRange(earliest.created_at, thisStart, thisEnd);
    const isNewLast = full_history && earliest && tsInRange(earliest.created_at, lastStart, lastEnd);

    return {
      project_id: f.project_id,
      in_this: tsInRange(f.last_modified, thisStart, thisEnd),
      in_last: tsInRange(f.last_modified, lastStart, lastEnd),
      namedThis,
      namedLast,
      commThis,
      commLast,
      isNewThis,
      isNewLast
    };
  });

  // 5. Aggregate per week
  const aggregate = (keyThis) => {
    const keyPart = keyThis ? 'this' : 'last';
    const matched = perFile.filter((x) => (keyThis ? x.in_this : x.in_last));
    const distinctProjects = new Set(matched.map((x) => x.project_id));
    return {
      projects: distinctProjects.size,
      files: matched.length,
      new_files: matched.filter((x) => (keyThis ? x.isNewThis : x.isNewLast)).length,
      versions: matched.reduce((s, x) => s + (keyThis ? x.namedThis : x.namedLast), 0),
      comments: matched.reduce((s, x) => s + (keyThis ? x.commThis : x.commLast), 0)
    };
  };

  return { this: aggregate(true), last: aggregate(false) };
}

// Back-compat single-week call — now just extracts one slot from the combined fetch.
export async function fetchWeeklyData(token, teamId, start, end) {
  const { this: thisAgg } = await fetchTwoWeeksData(token, teamId, start, end, start, end);
  return thisAgg;
}

// Cache warmer — used by scripts/warm.js and future scheduled refresh.
export async function warmCache(token, teamId) {
  const projects = await getProjects(token, teamId);
  for (const p of projects) {
    await getProjectFiles(token, p.id);
    await sleep(PROJECT_FILES_DELAY_MS);
  }
  return projects.length;
}
