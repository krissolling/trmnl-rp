// Date utilities. Week = Monday 00:00 local → following Monday 00:00.

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offsetToMonday);
  return d;
}

export function endOfWeek(date) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return end;
}

export function weekBounds(now = new Date()) {
  const thisStart = startOfWeek(now);
  const thisEnd = endOfWeek(now);
  const lastStart = new Date(thisStart);
  lastStart.setDate(lastStart.getDate() - 7);
  const lastEnd = thisStart;
  return { thisStart, thisEnd, lastStart, lastEnd };
}

// Progress = days complete through the 5-day working week (Mon=1 ... Fri=5, weekend=5).
export function weekProgress(now = new Date()) {
  const dow = now.getDay();
  if (dow === 0 || dow === 6) return 5; // weekend → week is "done"
  return dow; // Mon=1 Tue=2 Wed=3 Thu=4 Fri=5
}

export function formatLabel(now = new Date()) {
  const short = DAY_SHORT[now.getDay()];
  const day = now.getDate();
  const month = MONTH_SHORT[now.getMonth()];
  const dow = now.getDay();
  const inProgress = dow !== 0 && dow !== 6;
  return inProgress
    ? `${short} ${day} ${month} · week in progress`
    : `${short} ${day} ${month}`;
}

export function dayShort(now = new Date()) {
  return DAY_SHORT[now.getDay()];
}
