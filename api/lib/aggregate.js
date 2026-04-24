// Shapes the raw weekly aggregates from figma.js into the JSON contract
// that the Liquid templates consume.

import { weekProgress, formatLabel, dayShort } from './week.js';
import { buildTrends } from './trend.js';

export function buildResponse(now, thisWeek, lastWeek) {
  const cur = {
    projects: thisWeek.projects,
    files: thisWeek.files,
    new_files: thisWeek.new_files,
    versions: thisWeek.versions,
    comments: thisWeek.comments
  };
  const ref = {
    kind: 'lastwk',
    projects: lastWeek.projects,
    files: lastWeek.files,
    new_files: lastWeek.new_files,
    versions: lastWeek.versions,
    comments: lastWeek.comments
  };
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
