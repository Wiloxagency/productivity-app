// Timezone helpers without external deps (Intl only).
// Convention in this app: the `date` bucket of TimeEntry / DailyPlanning /
// Task.plannedDate is the LOCAL calendar day stored as UTC midnight
// (new Date('YYYY-MM-DD')).

const pad = (n) => String(n).padStart(2, '0');

const formatterCache = new Map();
const getFormatter = (tz) => {
  if (!formatterCache.has(tz)) {
    formatterCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'short'
    }));
  }
  return formatterCache.get(tz);
};

const isValidTimeZone = (tz) => {
  try {
    getFormatter(tz).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const zonedParts = (date, tz) => {
  const parts = {};
  for (const p of getFormatter(tz).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday
  };
};

// Offset (ms) of `tz` at instant `date`: local wall clock - UTC
const tzOffsetMs = (date, tz) => {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

const parseHHmm = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return { h, mi };
};

// Wall-clock time (YYYY-MM-DD + HH:mm) in `tz` -> UTC Date
const zonedToUtc = (ymd, hhmm, tz) => {
  const [y, mo, d] = String(ymd).split('-').map(Number);
  const t = parseHHmm(hhmm) || { h: 0, mi: 0 };
  const guess = Date.UTC(y, mo - 1, d, t.h, t.mi, 0);
  const off1 = tzOffsetMs(new Date(guess), tz);
  let result = guess - off1;
  const off2 = tzOffsetMs(new Date(result), tz);
  if (off2 !== off1) result = guess - off2;
  return new Date(result);
};

const localDateStr = (date, tz) => {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

const localTimeStr = (date, tz) => {
  const p = zonedParts(date, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
};

const localDateTimeStr = (date, tz) => `${localDateStr(date, tz)} ${localTimeStr(date, tz)}`;

const addDaysStr = (ymd, days) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

const weekdayName = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const names = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return names[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

// Local day bucket used by the existing models (UTC midnight of the local day)
const dayBucket = (ymd) => new Date(`${ymd}T00:00:00.000Z`);

const addMinutes = (date, minutes) => new Date(new Date(date).getTime() + minutes * 60000);
const diffMinutes = (a, b) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 60000);

module.exports = {
  isValidTimeZone,
  zonedParts,
  zonedToUtc,
  parseHHmm,
  localDateStr,
  localTimeStr,
  localDateTimeStr,
  addDaysStr,
  weekdayName,
  dayBucket,
  addMinutes,
  diffMinutes
};
