// Shared request handler. Runtime-agnostic — used by both the local HTTP server
// and the Netlify function wrapper.
//
// L1 cache: the fully-aggregated response, keyed by week-of-year. 30 min TTL —
// TRMNL polls every ~15 min, so most polls hit this and never touch Figma.

import { mockResponse } from './mock.js';
import { fetchTwoWeeksData } from './figma.js';
import { buildResponse } from './aggregate.js';
import { weekBounds } from './week.js';
import { cacheGetOrSet } from './cache.js';

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

  // L1 cache key changes when the week rolls over.
  const cacheKey = `response/${weekKey(thisStart)}`;

  return cacheGetOrSet(cacheKey, RESPONSE_TTL, async () => {
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
}
