import { parseCalendarDate } from './calendarDate';

function getStartTimestamp(trip) {
  const date = parseCalendarDate(trip?.startDate);
  return date ? date.getTime() : null;
}

export function sortTripsByLatestStart(location) {
  return (Array.isArray(location?.trips) ? location.trips : [])
    .map((trip, index) => ({ trip, index, timestamp: getStartTimestamp(trip) }))
    .sort((a, b) => {
      if (a.timestamp !== null && b.timestamp !== null && a.timestamp !== b.timestamp) {
        return b.timestamp - a.timestamp;
      }
      if (a.timestamp !== null && b.timestamp === null) return -1;
      if (a.timestamp === null && b.timestamp !== null) return 1;
      return a.index - b.index;
    })
    .map(({ trip }) => trip);
}

export function getDefaultTrip(location) {
  const trips = sortTripsByLatestStart(location);
  if (!trips.length) return null;

  const configuredTrip = trips.find((trip) => trip.id === location?.defaultTripId);
  return configuredTrip || trips[0];
}

export function getPhotoUrl(photo) {
  if (typeof photo === 'string') return photo;
  return photo?.url || photo?.src || photo?.dataUrl || '';
}

export function getTripPhotos(trip) {
  const directPhotos = Array.isArray(trip?.photos) ? trip.photos : [];
  const dayPhotos = (trip?.days || []).flatMap((day) => (day.blocks || []).flatMap((block) => {
    if (block.type === 'photos') return block.data?.photos || [];
    if (block.type !== 'itinerary') return [];
    return (block.data?.slots || []).flatMap((slot) => (
      ['breakfast', 'lunch', 'dinner'].map((key) => slot?.[key]).filter(Boolean)
    ));
  }));
  const seen = new Set();
  return [...directPhotos, ...dayPhotos].filter((photo) => {
    const key = typeof photo === 'string' ? photo : photo?.assetId || photo?.id || getPhotoUrl(photo);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getTripPhotoCount(trip) {
  return getTripPhotos(trip).length;
}

export function formatTripDate(value) {
  if (!value) return '待定日期';
  return String(value).replace(/-/g, '.');
}

export function formatTripDateRange(trip) {
  const start = formatTripDate(trip?.startDate);
  const end = formatTripDate(trip?.endDate || trip?.startDate);
  return start === end ? start : start + ' — ' + end;
}
