import assert from 'node:assert/strict';
import {
  addCalendarDays,
  formatCalendarDate,
  inclusiveCalendarDayCount,
  parseCalendarDate,
} from '../src/utils/calendarDate.js';

function listDates(start, count) {
  const dates = [];
  let current = parseCalendarDate(start);
  for (let index = 0; index < count; index += 1) {
    dates.push(formatCalendarDate(current));
    current = addCalendarDays(current, 1);
  }
  return dates;
}

assert.deepEqual(listDates('2026-02-23', 5), [
  '2026-02-23', '2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27',
]);
assert.equal(inclusiveCalendarDayCount('2026-02-23', '2026-02-27'), 5);
assert.equal(inclusiveCalendarDayCount('2026-02-27', '2026-03-02'), 4);
assert.equal(inclusiveCalendarDayCount('2026-12-30', '2027-01-02'), 4);
assert.equal(inclusiveCalendarDayCount('2026-02-23', '2026-02-23'), 1);
assert.equal(formatCalendarDate(new Date(2026, 1, 23, 0, 0, 0)), '2026-02-23');
assert.equal(formatCalendarDate(parseCalendarDate('2026-02-23')), '2026-02-23');

console.log('calendar-date tests passed');
