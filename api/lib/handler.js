// Shared request handler. Runtime-agnostic — used by both the local HTTP server
// and the Netlify function wrapper.
//
// L1 cache is stale-while-revalidate:
//   - Fresh hit → return immediately.
//   - Stale hit → return stale immediately, kick off background refresh.
//   - Miss → wait for fresh fetch (only happens on first ever poll).
//
// In-flight refreshes are de-duplicated via a per-key promise map so a flurry
// of TRMNL polls never spawn parallel rebuilds.

import { mockResponse } from './mock.js';
import { fetchTwoWeeksData } from './figma.js';
import { buildResponse } from './aggregate.js';
import { weekBounds } from './week.js';
import { cacheReadAny, cacheSet, cacheGetStale } from './cache.js';

const RESPONSE_TTL = 30 * 60; // 30 min — when stale, refresh in background

const inFlight = new Map(); // cacheKey -> Promise<data>

function weekKey(start) {
  return start.toISOString().slice(0, 10); // e.g. 2026-04-20 (Monday)
}

async function refresh(cacheKey, factory) {
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);
  const p = (async () => {
    try {
      const fresh = await factory();
      await cacheSet(cacheKey, fresh, RESPONSE_TTL);
      return fresh;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();
  inFlight.set(cacheKey, p);
  return p;
}

export async function getPayload(env = process.env, now = new Date()) {
  const token = env.FIGMA_TOKEN;
  const teamId = env.FIGMA_TEAM_ID;
  const useMock = env.MOCK === '1' || !token || !teamId;

  if (useMock) {
    const override = env.MOCK_DAY && env.MOCK_DAY !== 'auto' ? env.MOCK_DAY : null;
    return mockResponse(now, override);
  }

  const { thisStart, thisEnd, lastStart, lastEnd } = weekBounds(now);
  const cacheKey = `response/${weekKey(thisStart)}`;

  const factory = async () => {
    const { this: thisWeek, last: lastWeek } = await fetchTwoWeeksData(
      token, teamId, thisStart, thisEnd, lastStart, lastEnd
    );
    return buildResponse(now, thisWeek, lastWeek);
  };

  const cached = await cacheReadAny(cacheKey);

  // Fresh cache → done.
  if (cached && !cached.expired) return cached.data;

  // Stale cache → return it now, refresh in the background.
  if (cached && cached.expired) {
    refresh(cacheKey, factory).catch((e) =>
      console.error('[swr] background refresh failed:', e.message)
    );
    return { ...cached.data, stale: true };
  }

  // No cache at all — first poll ever, or cache wiped. Have to wait.
  try {
    return await refresh(cacheKey, factory);
  } catch (err) {
    console.error('[handler] cold fetch failed, falling back:', err.message);
    const lastWeekKey = `response/${weekKey(lastStart)}`;
    const olderStale = await cacheGetStale(lastWeekKey);
    if (olderStale) return { ...olderStale, stale: true };
    return { ...mockResponse(now), stale: true, mock_fallback: true };
  }
}
