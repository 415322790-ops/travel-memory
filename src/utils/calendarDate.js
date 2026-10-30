const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function createCalendarDate(year, month, day) {
  const value = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    value.getFullYear() !== year
    || value.getMonth() !== month - 1
    || value.getDate() !== day
  ) return null;
  return value;
}

/** Parse a calendar date without treating YYYY-MM-DD as a UTC timestamp. */
export function parseCalendarDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return createCalendarDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value !== 'string') return null;
  const match = value.match(CALENDAR_DATE_PATTERN);
  if (!match) return null;
  return createCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** Format a local Date as the storage-safe YYYY-MM-DD calendar string. */
export function formatCalendarDate(value) {
  const date = parseCalendarDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatCalendarDateLabel(value) {
  const date = parseCalendarDate(value);
  if (!date) return '';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatCalendarMonthDay(value) {
  const date = parseCalendarDate(value);
  if (!date) return '';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatCalendarWeekday(value, locale = 'zh-CN') {
  const date = parseCalendarDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
}

export function addCalendarDays(value, amount) {
  const date = parseCalendarDate(value);
  if (!date) return null;
  date.setDate(date.getDate() + amount);
  return date;
}

export function calendarDayDifference(startValue, endValue) {
  const start = parseCalendarDate(startValue);
  const end = parseCalendarDate(endValue);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function inclusiveCalendarDayCount(startValue, endValue = startValue) {
  const difference = calendarDayDifference(startValue, endValue);
  return difference === null || difference < 0 ? null : difference + 1;
}
