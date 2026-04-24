// Canned mock data used when FIGMA_TOKEN is absent or MOCK=1.
// Values match the playground's reference snapshots so dev parity holds.

import { weekProgress, formatLabel, dayShort } from './week.js';
import { buildTrends } from './trend.js';

// Last week's "final" — the reference everyone compares against on arrival.
const LAST_WEEK = {
  projects: 7,
  files: 34,
  new_files: 9,
  versions: 21,
  comments: 63
};

// This-week-to-date by day-of-week. Matches playground tuning.
const BY_DAY = {
  mon: { projects: 2, files: 5,  new_files: 1, versions: 2,  comments: 8 },
  tue: { projects: 3, files: 9,  new_files: 2, versions: 4,  comments: 15 },
  wed: { projects: 5, files: 19, new_files: 5, versions: 11, comments: 34 },
  thu: { projects: 7, files: 29, new_files: 8, versions: 18, comments: 54 },
  fri: { projects: 7, files: 33, new_files: 9, versions: 21, comments: 62 }
};

function dayKeyFromDate(now) {
  const dow = now.getDay();
  if (dow === 1) return 'mon';
  if (dow === 2) return 'tue';
  if (dow === 3) return 'wed';
  if (dow === 4) return 'thu';
  if (dow === 5) return 'fri';
  // Sat/Sun: show Friday's final
  return 'fri';
}

export function mockResponse(now = new Date(), override = null) {
  const key = override && BY_DAY[override] ? override : dayKeyFromDate(now);
  const cur = BY_DAY[key];
  const ref = { kind: 'lastwk', ...LAST_WEEK };

  return {
    view: 'live',
    label: formatLabel(now),
    day_short: dayShort(now),
    progress: weekProgress(now),
    is_live: true,
    generated_at: now.toISOString(),
    cur,
    ref,
    trends: buildTrends(cur, ref, ref.kind)
  };
}
