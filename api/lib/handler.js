// Shared request handler. Runtime-agnostic — used by both the local HTTP server
// and the Netlify function wrapper.
//
// L1 cache: the fully-aggregated response, keyed by week-of-year. 30 min TTL —
// TRMNL polls every ~15 min, so most polls hit this and never touch Figma.

import { mockResponse } from './mock.js';
import { fetchTwoWeeksData } from './figma.js';
import { buildResponse } from './aggregate.js';
import { weekBounds } from './week.js';
import { cacheGetOrSet, cacheGetStale } from './cache.js';

const RESPONSE_TTL = 30 * 60; // 30 min

function weekKey(start) {
  return start.toISOString().slice(0, 10); // e.g. 2026-04-20 (Monday)
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

  // Happy path: fresh L1 cache hit, or rebuild + cache.
  try {
    return await cacheGetOrSet(cacheKey, RESPONSE_TTL, async () => {
      const { this: thisWeek, last: lastWeek } = await fetchTwoWeeksData(
        token,
        teamId,
        thisStart,
        thisEnd,
        lastStart,
        lastEnd
      );
      return buildResponse(now, thisWeek, lastWeek);
    });
  } catch (err) {
    // Figma error or rate limit — never let the display go blank. Serve last
    // known good aggregated response (this week's, then last week's), and only
    // fall back to mock if we have nothing.
    console.error('[handler] live fetch failed, serving stale:', err.message);
    const stale = await cacheGetStale(cacheKey);
    if (stale) return { ...stale, stale: true };

    const lastWeekKey = `response/${weekKey(lastStart)}`;
    const olderStale = await cacheGetStale(lastWeekKey);
    if (olderStale) return { ...olderStale, stale: true };

    return { ...mockResponse(now), stale: true, mock_fallback: true };
  }
}
