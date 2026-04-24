// Pre-renders the small reference line shown under each number.
// Done in the backend so Liquid templates stay legible.

export function makeTrend(cur, ref, kind) {
  if (kind === 'lastwk') return `last wk · ${ref}`;
  const arrow = cur > ref ? '↑' : cur < ref ? '↓' : '=';
  return `${arrow} from ${ref} · 4w avg`;
}

export function makeCommentsLine(cur, ref, kind) {
  if (kind === 'lastwk') return `${cur} comments · last wk ${ref}`;
  return `${cur} comments`;
}

export function buildTrends(curObj, refObj, kind) {
  return {
    projects: makeTrend(curObj.projects, refObj.projects, kind),
    files: makeTrend(curObj.files, refObj.files, kind),
    new_files: makeTrend(curObj.new_files, refObj.new_files, kind),
    versions: makeTrend(curObj.versions, refObj.versions, kind),
    comments_line: makeCommentsLine(curObj.comments, refObj.comments, kind)
  };
}
