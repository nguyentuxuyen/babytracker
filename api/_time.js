const { toDate } = require('../src/domain/activitySchema');

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

// Parse a timestamp from the client or Gemini. A local time without an offset
// ("2026-10-09T14:20") is read in the user's offset, not in the server's UTC.
const parseUserTimestamp = (value, utcOffsetMinutes) => {
  if (typeof value === 'string' && /T\d{2}:\d{2}/.test(value) && !HAS_OFFSET.test(value.trim())) {
    const asUtc = new Date(`${value.trim()}Z`);
    if (Number.isNaN(asUtc.getTime())) return null;
    return new Date(asUtc.getTime() - utcOffsetMinutes * 60 * 1000);
  }
  return toDate(value);
};

// "2026-10-09T14:20:00+09:00" for a Date shown in the user's offset.
const formatLocalIso = (date, utcOffsetMinutes) => {
  const local = new Date(date.getTime() + utcOffsetMinutes * 60 * 1000);
  const sign = utcOffsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(utcOffsetMinutes);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return `${local.toISOString().slice(0, 19)}${offset}`;
};

// Minutes east of UTC; the browser's getTimezoneOffset() is the negation. Defaults to JST.
const normalizeOffset = (value) => {
  const offset = Number(value);
  return Number.isFinite(offset) && Math.abs(offset) <= 14 * 60 ? Math.round(offset) : 9 * 60;
};

module.exports = { parseUserTimestamp, formatLocalIso, normalizeOffset };
