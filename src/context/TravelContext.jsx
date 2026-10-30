import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { addCalendarDays, formatCalendarDate, parseCalendarDate } from '../utils/calendarDate';
import {
  getRuntimeAssetUrl,
  loadOrMigrateTravelState,
  persistIncrementalWrites,
  persistPhotoMutation,
  releaseRuntimeAsset,
  releaseRuntimeAssets,
} from '../storage/travelDb';
import {
  isSupabaseConfigured,
} from '../lib/supabaseClient';
import {
  loadSupabaseTravelState,
  persistSupabaseOperations,
  persistSupabasePhotoMutation,
} from '../services/supabaseTravelRepository';

const TravelContext = createContext(null);
const STORAGE_KEY = 'travel-memory-v2';

function newId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6); }

// Block type definitions
const SLOT_DEFAULTS = [
  { key: 'morning', label: '🌅 早上', meal: 'breakfast', mealLabel: '🥐 早餐' },
  { key: 'afternoon', label: '☀️ 下午', meal: 'lunch', mealLabel: '🍜 午餐' },
  { key: 'evening', label: '🌙 晚上', meal: 'dinner', mealLabel: '🍲 晚餐' },
];

export const BLOCK_DEFS = {
  itinerary: { icon: '📋', title: '行程', order: 0 },
  photos:    { icon: '📷', title: '照片', order: 1 },
  feeling:   { icon: '💭', title: '感受', order: 2 },
  companions:{ icon: '👥', title: '同行人', order: 3 },
  music:     { icon: '🎵', title: '音乐', order: 4 },
  text:      { icon: '📝', title: '笔记', order: 5 },
};

function createBlock(type) {
  const def = BLOCK_DEFS[type];
  const data = {};
  if (type === 'itinerary') {
    data.slotDefs = [
      { key: 'morning', label: '🌅 早上', meal: 'breakfast', mealLabel: '🥐 早餐' },
      { key: 'afternoon', label: '☀️ 下午', meal: 'lunch', mealLabel: '🍜 午餐' },
      { key: 'evening', label: '🌙 晚上', meal: 'dinner', mealLabel: '🍲 晚餐' },
    ];
    data.slots = data.slotDefs.map((sd) => ({ key: sd.key, text: '', [sd.meal]: null }));
    data.journeyText = '';
    data.journeyTextMigrated = true;
  } else if (type === 'photos') {
    data.photos = [];
  } else if (type === 'music') {
    data.title = '';
    data.url = '';
  } else if (type === 'feeling') {
    data.text = '';
    data.mood = [];
    data.moodNote = '';
  } else if (type === 'companions' || type === 'text') {
    data.text = '';
  }
  return { id: newId(), type, title: def.icon + ' ' + def.title, data };
}

const DEFAULT_BLOCKS = ['itinerary', 'photos', 'music', 'feeling', 'companions'];

function createEmptyDay(date) {
  return {
    id: newId(),
    date,
    blocks: DEFAULT_BLOCKS.map((t) => createBlock(t)),
  };
}

function generateDays(startDate, endDate) {
  const days = [];
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (!start || !end || start > end) return days;
  let current = start;
  while (current <= end) {
    days.push(createEmptyDay(formatCalendarDate(current)));
    current = addCalendarDays(current, 1);
  }
  return days;
}

const defaultLocations = [
  { id: 'guangzhou', name: '广州', lat: 23.1291, lng: 113.2644, landscapeImages: [], travelFrom: null, travelMethod: null, trips: [] },
  {
    id: 'lijiang', name: '丽江', lat: 26.8721, lng: 100.2299, landscapeImage: null, travelFrom: 'guangzhou', travelMethod: 'plane',
    trips: [{
      id: 'demo-trip', startDate: '2025-06-01', endDate: '2025-06-03',
      days: [
        {
          id: 'demo-d1', date: '2025-06-01',
          blocks: [
            { ...createBlock('itinerary'), data: {
              slotDefs: SLOT_DEFAULTS.map((s) => ({...s})),
              slots: [
                { key: 'morning', text: '到达丽江古城，入住民宿', breakfast: null },
                { key: 'afternoon', text: '逛四方街，买手工艺品', lunch: null },
                { key: 'evening', text: '古城酒吧听民谣', dinner: null },
              ],
            }},
            { ...createBlock('photos') },
            { ...createBlock('music') },
            { ...createBlock('feeling'), data: { text: '丽江真的很治愈，古城的每一条巷子都值得慢慢走。' } },
            { ...createBlock('companions'), data: { text: '小明、小红' } },
          ],
        },
        {
          id: 'demo-d2', date: '2025-06-02',
          blocks: [
            { ...createBlock('itinerary'), data: {
              slotDefs: SLOT_DEFAULTS.map((s) => ({...s})),
              slots: [
                { key: 'morning', text: '出发去玉龙雪山', breakfast: null },
                { key: 'afternoon', text: '登顶4680米，蓝月谷拍照', lunch: null },
                { key: 'evening', text: '返回古城，吃腊排骨火锅', dinner: null },
              ],
            }},
            { ...createBlock('photos') },
            { ...createBlock('music') },
            { ...createBlock('feeling'), data: { text: '雪山太震撼了，蓝月谷的水是蓝色的！' } },
            { ...createBlock('companions'), data: { text: '小明、小红、当地向导阿木' } },
          ],
        },
        {
          id: 'demo-d3', date: '2025-06-03',
          blocks: [
            { ...createBlock('itinerary'), data: {
              slotDefs: SLOT_DEFAULTS.map((s) => ({...s})),
              slots: [
                { key: 'morning', text: '束河古镇闲逛', breakfast: null },
                { key: 'afternoon', text: '买茶叶和手信', lunch: null },
                { key: 'evening', text: '整理行李，准备出发去成都', dinner: null },
              ],
            }},
            { ...createBlock('photos') },
            { ...createBlock('music') },
            { ...createBlock('feeling') },
            { ...createBlock('companions') },
          ],
        },
      ],
    }],
  },
  { id: 'chengdu', name: '成都', lat: 30.5728, lng: 104.0668, landscapeImage: null, travelFrom: 'lijiang', travelMethod: 'train', trips: [] },
];

// ——— Migration ———
function stableId(prefix, ...parts) {
  const suffix = parts.filter(Boolean).join('-').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return suffix ? prefix + '-' + suffix : prefix;
}

function toLegacyText(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(toLegacyText).filter(Boolean).join('\n\n');
  if (value && typeof value === 'object') return toLegacyText(value.text || value.content || value.value || '');
  return '';
}

function normalizeItineraryData(data = {}) {
  const next = { ...data };
  if (next.journeyTextMigrated) return next;
  const slotText = Array.isArray(next.slots)
    ? next.slots.map((slot) => toLegacyText(slot?.text || slot?.content || '')).filter(Boolean)
    : [];
  const fallbackText = slotText.length
    ? slotText
    : ['morning', 'afternoon', 'evening'].map((key) => toLegacyText(next[key])).filter(Boolean);
  const chunks = fallbackText.length ? fallbackText : toLegacyText(next.events).split('\n\n').filter(Boolean);
  next.journeyText = typeof next.journeyText === 'string' && next.journeyText.trim()
    ? next.journeyText
    : chunks.join('\n\n');
  next.journeyTextMigrated = true;
  return next;
}

function normalizeFeelingData(data = {}) {
  const next = { ...data };
  const moodValue = Array.isArray(next.mood) ? next.mood : Array.isArray(next.moods) ? next.moods : next.mood ? [next.mood] : [];
  next.mood = moodValue;
  if (!next.text) next.text = toLegacyText(next.reflection || next.travelReflection || '');
  if (next.moodNote === undefined) next.moodNote = toLegacyText(next.note || next.moodText || '');
  return next;
}

function migrateBlock(b) {
  if (b?.type && b.id) {
    if (b.type === 'itinerary') return { ...b, data: normalizeItineraryData(b.data || {}) };
    if (b.type === 'feeling') return { ...b, data: normalizeFeelingData(b.data || {}) };
    return b;
  }
  if (b?.timeSlot || b?.text !== undefined) {
    return {
      id: newId(),
      type: 'itinerary',
      title: 'TRAVEL JOURNEY',
      data: normalizeItineraryData({
        slots: [{ key: 'morning', text: b.text || '', breakfast: b.breakfast }, { key: 'afternoon', text: '', lunch: null }, { key: 'evening', text: '', dinner: null }],
      }),
    };
  }
  return createBlock('text');
}

function migrateDay(d, fallbackId) {
  const id = d.id || fallbackId || newId();
  if (d.blocks) {
    const blocks = d.blocks.map(migrateBlock);
    if (!blocks.some((block) => block.type === 'itinerary')) blocks.push(createBlock('itinerary'));
    if (!blocks.some((block) => block.type === 'feeling')) blocks.push(createBlock('feeling'));
    blocks.sort((a, b) => (BLOCK_DEFS[a.type]?.order ?? 99) - (BLOCK_DEFS[b.type]?.order ?? 99));
    return { ...d, id, blocks };
  }

  const legacyItinerary = d.itinerary && typeof d.itinerary === 'object' && !Array.isArray(d.itinerary) ? d.itinerary : {};
  const oldSlots = Array.isArray(d.itinerary)
    ? d.itinerary.map((s) => ({ key: s.timeSlot || s.key || 'morning', text: s.text || '', breakfast: s.breakfast || null, lunch: s.lunch || null, dinner: s.dinner || null }))
    : [];
  const defKeys = oldSlots.map((s) => s.key);
  const oldDefs = (defKeys.length ? defKeys : SLOT_DEFAULTS.map((slot) => slot.key)).map((key) => {
    const found = SLOT_DEFAULTS.find((slot) => slot.key === key);
    return found ? { ...found } : { key, label: key, meal: key, mealLabel: key };
  });
  const blocks = [];
  blocks.push({ ...createBlock('itinerary'), data: normalizeItineraryData({ ...legacyItinerary, slotDefs: oldDefs, slots: oldSlots, events: d.events, morning: d.morning, afternoon: d.afternoon, evening: d.evening }) });
  if (d.photos) blocks.push({ ...createBlock('photos'), data: { photos: d.photos } });
  if (d.music) blocks.push({ ...createBlock('music'), data: { title: d.music.title || '', url: d.music.url || '' } });
  const oldFeeling = d.feeling && typeof d.feeling === 'object' ? d.feeling : {};
  const oldReflection = d.reflection || d.travelReflection || (typeof d.feeling === 'string' ? d.feeling : oldFeeling.text || oldFeeling.reflection || '');
  const oldMood = d.mood || oldFeeling.mood || oldFeeling.moods || [];
  const oldMoodNote = d.moodNote || oldFeeling.moodNote || oldFeeling.note || '';
  if (oldReflection || oldMood || oldMoodNote || d.feeling) blocks.push({ ...createBlock('feeling'), data: normalizeFeelingData({ ...oldFeeling, text: oldReflection, mood: oldMood, moodNote: oldMoodNote }) });
  else blocks.push(createBlock('feeling'));
  if (d.companions) blocks.push({ ...createBlock('companions'), data: { text: d.companions } });
  return { id, date: d.date, blocks };
}

function normalizeTripPhoto(raw, fallbackId, extra = {}) {
  const data = raw && typeof raw === 'object' ? raw : { url: raw };
  const url = data.url || data.src || '';
  const id = data.assetId || data.id || fallbackId;
  if (!url && !id && !data.blob) return null;
  return {
    ...data,
    ...extra,
    id,
    assetId: data.assetId || id,
    url,
  };
}

function getPhotoAssetId(photo) {
  if (!photo || typeof photo === 'string') return '';
  return photo.assetId || photo.id || '';
}

function photoReferenceMatches(reference, photo, photoId) {
  if (getPhotoAssetId(reference) === photoId) return true;
  const referenceUrl = typeof reference === 'string' ? reference : (reference?.url || reference?.src || reference?.sourceUrl || '');
  const photoUrl = photo?.url || photo?.src || photo?.sourceUrl || '';
  return Boolean(referenceUrl && photoUrl && referenceUrl === photoUrl);
}

function movePhotoReferencesInTrip(trip, photoId, targetDayId) {
  const photos = Array.isArray(trip?.photos) ? trip.photos : [];
  const photoIndex = photos.findIndex((photo, index) => normalizeTripPhoto(photo, stableId('photo', trip.id, index))?.id === photoId);
  if (photoIndex < 0 || !trip?.days?.some((day) => day.id === targetDayId)) return null;
  const photo = normalizeTripPhoto(photos[photoIndex], stableId('photo', trip.id, photoIndex));
  if (!photo) return null;
  const movedPhoto = { ...photo, dayId: targetDayId };
  let targetHasPhotosBlock = false;
  let targetReferenceAdded = false;
  const days = trip.days.map((day) => {
    const isTarget = day.id === targetDayId;
    let hasPhotosBlock = false;
    const blocks = (day.blocks || []).map((block) => {
      if (block.type !== 'photos') return block;
      hasPhotosBlock = true;
      const references = Array.isArray(block.data?.photos) ? block.data.photos : [];
      const matchingReferences = references.filter((reference) => photoReferenceMatches(reference, photo, photoId));
      const remainingReferences = references.filter((reference) => !photoReferenceMatches(reference, photo, photoId));
      if (!isTarget) return matchingReferences.length
        ? { ...block, data: { ...block.data, photos: remainingReferences } }
        : block;
      targetHasPhotosBlock = true;
      if (targetReferenceAdded) return matchingReferences.length
        ? { ...block, data: { ...block.data, photos: remainingReferences } }
        : block;
      targetReferenceAdded = true;
      return {
        ...block,
        data: {
          ...block.data,
          photos: [...remainingReferences, movedPhoto],
        },
      };
    });
    if (isTarget && !hasPhotosBlock) {
      targetHasPhotosBlock = true;
      blocks.push({ ...createBlock('photos'), data: { photos: [movedPhoto] } });
    }
    return { ...day, blocks };
  });
  if (!targetHasPhotosBlock) return null;
  return {
    ...trip,
    photos: photos.map((entry, index) => index === photoIndex ? movedPhoto : entry),
    photosMigrated: true,
    days,
  };
}

function restorePhotoMoveInTrip(currentTrip, originalTrip, photoId) {
  if (!currentTrip || !originalTrip) return currentTrip;
  const originalPhoto = (originalTrip.photos || []).find((photo, index) => normalizeTripPhoto(photo, stableId('photo', originalTrip.id, index))?.id === photoId);
  if (!originalPhoto) return currentTrip;
  const normalizedOriginal = normalizeTripPhoto(originalPhoto, photoId);
  const photos = (currentTrip.photos || []).map((photo, index) => {
    const normalized = normalizeTripPhoto(photo, stableId('photo', currentTrip.id, index));
    if (normalized?.id !== photoId) return photo;
    const restored = { ...normalized };
    if (Object.prototype.hasOwnProperty.call(normalizedOriginal, 'dayId')) restored.dayId = normalizedOriginal.dayId;
    else delete restored.dayId;
    return restored;
  });
  const originalDays = new Map((originalTrip.days || []).map((day) => [day.id, day]));
  const days = (currentTrip.days || []).map((day) => {
    const originalDay = originalDays.get(day.id);
    const originalPhotoBlocks = new Map((originalDay?.blocks || [])
      .filter((block) => block.type === 'photos')
      .map((block) => [block.id, block]));
    const blocks = (day.blocks || []).map((block) => {
      if (block.type !== 'photos') return block;
      const originalBlock = originalPhotoBlocks.get(block.id);
      const references = Array.isArray(block.data?.photos) ? block.data.photos : [];
      const remaining = references.filter((reference) => !photoReferenceMatches(reference, normalizedOriginal, photoId));
      const originalReferences = Array.isArray(originalBlock?.data?.photos) ? originalBlock.data.photos : [];
      const matchingOriginals = originalReferences
        .map((reference, index) => ({ reference, index }))
        .filter(({ reference }) => photoReferenceMatches(reference, normalizedOriginal, photoId));
      if (!originalBlock && !remaining.length) return null;
      matchingOriginals.forEach(({ reference, index }) => {
        remaining.splice(Math.min(index, remaining.length), 0, reference);
      });
      return { ...block, data: { ...block.data, photos: remaining } };
    }).filter(Boolean);
    return { ...day, blocks };
  });
  const restored = { ...currentTrip, photos, days };
  if (Object.prototype.hasOwnProperty.call(originalTrip, 'photosMigrated')) restored.photosMigrated = originalTrip.photosMigrated;
  else delete restored.photosMigrated;
  return restored;
}

function collectTripAssetIds(trip) {
  const ids = new Set();
  const add = (photo) => {
    const id = getPhotoAssetId(photo);
    if (id) ids.add(id);
  };
  add(trip?.coverPhoto);
  (trip?.photos || []).forEach(add);
  (trip?.days || []).forEach((day) => (day.blocks || []).forEach((block) => {
    if (block.type === 'photos') (block.data?.photos || []).forEach(add);
    if (block.type === 'itinerary') (block.data?.slots || []).forEach((slot) => {
      ['breakfast', 'lunch', 'dinner'].forEach((mealType) => add(slot?.[mealType]));
    });
  }));
  return ids;
}

function isRuntimeAssetSource(value) {
  return typeof value === 'string' && (value.startsWith('blob:') || value.startsWith('data:'));
}

function photoNeedsBlobWrite(photo) {
  return Boolean(photo?.blob || isRuntimeAssetSource(photo?.url));
}

function collectPersistedEntities(locations) {
  const locationsById = new Map();
  const tripsById = new Map();
  const photosById = new Map();

  const addPhoto = (photo, locationId, tripId, priority = 0) => {
    const id = getPhotoAssetId(photo);
    if (!id) return;
    const current = photosById.get(id);
    const next = { photo, locationId, tripId, priority };
    if (!current || priority > current.priority || (priority === current.priority && photo?.blob && !current.photo?.blob)) {
      photosById.set(id, next);
    }
  };

  (locations || []).forEach((location) => {
    if (!location?.id) return;
    locationsById.set(location.id, location);
    (location.landscapeImages || []).forEach((image, index) => {
      const assetId = location.landscapeImageAssetIds?.[index];
      if (assetId) {
        const photo = typeof image === 'object'
          ? { ...image, id: image.assetId || assetId, assetId: image.assetId || assetId }
          : { id: assetId, assetId, url: image };
        addPhoto(photo, location.id, null);
      }
    });
    (location.overviewHiddenImages || []).forEach((image) => addPhoto(image, location.id, null));
    (location.trips || []).forEach((trip) => {
      if (!trip?.id) return;
      tripsById.set(trip.id, { trip, locationId: location.id });
      addPhoto(trip.coverPhoto, location.id, trip.id);
      // Trip.photos owns editable photo metadata. Day blocks and covers are
      // references and may still contain values from before a crop or move.
      (trip.photos || []).forEach((photo) => addPhoto(photo, location.id, trip.id, 2));
      (trip.days || []).forEach((day) => (day.blocks || []).forEach((block) => {
        if (block.type === 'photos') (block.data?.photos || []).forEach((photo) => addPhoto(photo, location.id, trip.id, 1));
        if (block.type === 'itinerary') (block.data?.slots || []).forEach((slot) => {
          ['breakfast', 'lunch', 'dinner'].forEach((mealType) => addPhoto(slot?.[mealType], location.id, trip.id));
        });
      }));
    });
  });

  return { locationsById, tripsById, photosById };
}

function resolvePendingOperations(entries, locations) {
  const entities = collectPersistedEntities(locations);
  const operations = [];
  entries.forEach(([, entry]) => {
    if (entry.kind === 'location-put') {
      const location = entities.locationsById.get(entry.locationId);
      if (location) operations.push({ type: 'location-put', action: entry.action, location });
      return;
    }
    if (entry.kind === 'location-delete') {
      if (!entities.locationsById.has(entry.locationId)) operations.push({ type: 'location-delete', action: entry.action, locationId: entry.locationId });
      return;
    }
    if (entry.kind === 'trip-put') {
      const current = entities.tripsById.get(entry.tripId);
      if (current) operations.push({ type: 'trip-put', action: entry.action, trip: current.trip, locationId: current.locationId });
      return;
    }
    if (entry.kind === 'trip-delete') {
      if (!entities.tripsById.has(entry.tripId)) operations.push({ type: 'trip-delete', action: entry.action, tripId: entry.tripId });
      return;
    }
    if (entry.kind === 'photo-meta' || entry.kind === 'photo-asset') {
      const current = entities.photosById.get(entry.photoId);
      if (current) operations.push({
        type: entry.kind,
        action: entry.action,
        photo: current.photo,
        locationId: current.locationId,
        tripId: current.tripId,
      });
      return;
    }
    if (entry.kind === 'photo-delete') {
      if (!entities.photosById.has(entry.photoId)) operations.push({ type: 'photo-delete', action: entry.action, photoId: entry.photoId });
    }
  });
  return operations;
}

function mergePendingWrite(previous, next) {
  if (!previous) return next;
  if (previous.key === next.key && previous.kind.startsWith('photo-') && next.kind === 'photo-meta' && previous.kind === 'photo-asset') {
    return { ...previous, ...next, kind: 'photo-asset' };
  }
  return { ...previous, ...next };
}

function collectTripPhotos(trip, tripId, rawDays) {
  const legacyPhotos = [];
  rawDays.forEach((day, dayIndex) => {
    const photoBlock = (day.blocks || []).find((block) => block?.type === 'photos');
    (photoBlock?.data?.photos || []).forEach((photo, photoIndex) => {
      legacyPhotos.push(normalizeTripPhoto(photo, stableId('photo', tripId, day.id || dayIndex, photoIndex), { source: 'photo' }));
    });

    const itinerary = (day.blocks || []).find((block) => block?.type === 'itinerary');
    (itinerary?.data?.slots || []).forEach((slot, slotIndex) => {
      const mealType = ['breakfast', 'lunch', 'dinner'].find((key) => slot?.[key]);
      if (!mealType) return;
      const mealValue = slot[mealType];
      const mealEdits = itinerary.data?.mealPhotoEdits?.[slotIndex + ':' + mealType] || {};
      legacyPhotos.push(normalizeTripPhoto(mealValue, stableId('photo', tripId, day.id || dayIndex, 'meal', slotIndex, mealType), {
        source: 'meal',
        dayId: day.id || stableId(tripId, 'day', dayIndex),
        sourceIndex: slotIndex,
        mealType,
        ...mealEdits,
      }));
    });
  });

  const candidates = trip.photosMigrated
    ? (Array.isArray(trip.photos) ? trip.photos : [])
    : [...(Array.isArray(trip.photos) ? trip.photos : []), ...legacyPhotos];
  const seenIds = new Set();
  const seenUrls = new Set();
  return candidates.map((photo, index) => normalizeTripPhoto(photo, stableId('photo', tripId, index)))
    .filter((photo) => {
      const urlKey = photo?.url || '';
      if (!photo || seenIds.has(photo.id) || (urlKey && seenUrls.has(urlKey))) return false;
      seenIds.add(photo.id);
      if (urlKey) seenUrls.add(urlKey);
      return true;
    });
}

function migrateLocation(loc) {
  const rawTrips = Array.isArray(loc.trips) ? loc.trips : [];
  const trips = rawTrips.map((trip, tripIndex) => {
    const rawDays = Array.isArray(trip.days) ? trip.days : [];
    const legacyStart = trip.startDate || trip.yearMonth || rawDays[0]?.date || 'unknown';
    const tripId = trip.id || stableId('trip', loc.id || loc.name, legacyStart, tripIndex);
    const days = rawDays
      .map((day, dayIndex) => migrateDay(day, stableId(tripId, 'day', day.date || dayIndex)))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const startDate = trip.startDate || days[0]?.date || (trip.yearMonth ? trip.yearMonth + '-01' : '');
    const endDate = trip.endDate || days[days.length - 1]?.date || startDate;
    const monthLabel = startDate ? startDate.slice(0, 7).replace('-', '年') + '月' : '未定日期';
    const photos = collectTripPhotos(trip, tripId, days);
    const photoByUrl = new Map(photos.filter((photo) => photo?.url).map((photo) => [photo.url, photo]));
    const linkedDays = days.map((day) => ({
      ...day,
      blocks: (day.blocks || []).map((block) => {
        if (block.type === 'photos') {
          return {
            ...block,
            data: {
              ...block.data,
              photos: (block.data?.photos || []).map((photo) => photoByUrl.get(typeof photo === 'string' ? photo : photo?.url) || photo),
            },
          };
        }
        if (block.type !== 'itinerary') return block;
        const linkPhoto = (photo) => photoByUrl.get(typeof photo === 'string' ? photo : photo?.url) || photo || null;
        const slots = (block.data?.slots || []).map((slot) => ({
          ...slot,
          breakfast: linkPhoto(slot.breakfast),
          lunch: linkPhoto(slot.lunch),
          dinner: linkPhoto(slot.dinner),
        }));
        return { ...block, data: { ...block.data, slots } };
      }),
    }));
    return {
      ...trip,
      id: tripId,
      name: trip.name || (loc.name + '之旅 · ' + monthLabel),
      startDate,
      endDate,
      photos,
      photosMigrated: true,
      days: linkedDays,
    };
  });

  const legacyDays = trips.length === 0 && Array.isArray(loc.days) ? loc.days : [];
  if (legacyDays.length) {
    const days = legacyDays
      .map((day, index) => migrateDay(day, stableId('trip', loc.id || loc.name, 'unclassified', 'day', day.date || index)))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const startDate = days[0]?.date || '';
    const endDate = days[days.length - 1]?.date || startDate;
    trips.push({
      id: stableId('trip', loc.id || loc.name, 'unclassified'),
      name: '未归类旅程',
      startDate,
      endDate,
      photos: collectTripPhotos({}, stableId('trip', loc.id || loc.name, 'unclassified'), days),
      photosMigrated: true,
      days,
    });
  }

  return {
    ...loc,
    trips,
    landscapeImages: loc.landscapeImages || (loc.landscapeImage ? [loc.landscapeImage] : []),
    landscapeImageMeta: Array.isArray(loc.landscapeImageMeta) ? loc.landscapeImageMeta : [],
    landscapeImageAssetIds: Array.isArray(loc.landscapeImageAssetIds) ? loc.landscapeImageAssetIds : [],
  };
}

// ——— Provider ———
export function TravelProvider({ children }) {
  const [locations, setLocations] = useState([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState('loading');
  const [saveState, setSaveState] = useState({ status: 'idle', lastSavedAt: null, error: null, syncStatus: 'local' });
  const [selectedId, setSelectedId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState('earth');
  const [footprintMode, setFootprintMode] = useState(false);
  const locationsRef = useRef(locations);
  const persistenceTimerRef = useRef(null);
  const pendingWritesRef = useRef(new Map());
  const saveStateRef = useRef(saveState);
  const saveRevisionRef = useRef(0);
  const activeSaveCountRef = useRef(0);
  const latestSettledSaveRef = useRef({ revision: 0, success: null });
  const latestStorageRevisionRef = useRef(0);
  const flushPromiseRef = useRef(null);

  const updateSaveState = useCallback((updates) => {
    const next = { ...saveStateRef.current, ...updates };
    saveStateRef.current = next;
    setSaveState(next);
  }, []);

  const noteSaveMutation = useCallback(() => {
    saveRevisionRef.current += 1;
    updateSaveState({
      status: activeSaveCountRef.current > 0 ? 'saving' : 'dirty',
      error: null,
    });
    return saveRevisionRef.current;
  }, [updateSaveState]);

  const beginSaveAttempt = useCallback(() => {
    activeSaveCountRef.current += 1;
    updateSaveState({ status: 'saving', error: null });
  }, [updateSaveState]);

  const finishSaveAttempt = useCallback((revision, outcome) => {
    activeSaveCountRef.current = Math.max(0, activeSaveCountRef.current - 1);
    if (revision >= latestSettledSaveRef.current.revision) {
      latestSettledSaveRef.current = { revision, ...outcome };
      if (outcome.success) {
        updateSaveState({
          lastSavedAt: new Date().toISOString(),
          error: null,
          syncStatus: outcome.syncStatus,
        });
      } else {
        updateSaveState({ error: outcome.error, syncStatus: outcome.syncStatus });
      }
    }

    const latest = latestSettledSaveRef.current;
    const status = activeSaveCountRef.current > 0
      ? 'saving'
      : pendingWritesRef.current.size > 0
        ? latest.revision === saveRevisionRef.current && latest.success === true && latest.syncStatus === 'local'
          ? 'saved'
          : (latest.revision === saveRevisionRef.current && latest.success === false ? 'error' : 'dirty')
        : latest.success === true
          ? 'saved'
          : latest.success === false
            ? 'error'
            : 'idle';
    updateSaveState({ status });
  }, [updateSaveState]);

  const updateStorageStatusForSave = useCallback((revision, status) => {
    if (revision < latestStorageRevisionRef.current) return;
    latestStorageRevisionRef.current = revision;
    setStorageStatus(status);
  }, []);

  useEffect(() => {
    locationsRef.current = locations;
  }, [locations]);

  useEffect(() => {
    let cancelled = false;
    const fallbackLocations = defaultLocations.map(migrateLocation);
    const loadFromSource = async () => {
      if (!isSupabaseConfigured) {
        return loadOrMigrateTravelState({ fallbackLocations, storageKey: STORAGE_KEY, normalizeLocation: migrateLocation });
      }
      try {
        const remote = await loadSupabaseTravelState();
        if (!remote.empty) return remote;
        // Do not migrate the local backup implicitly. The first cloud test
        // should use a fresh Trip; migration remains an explicit service API.
        return { locations: fallbackLocations, stateMeta: null, status: 'ready', source: 'supabase-empty' };
      } catch (error) {
        // Cloud errors must not erase the local backup or make the UI blank.
        if (import.meta.env.DEV) {
          console.error('[SupabasePersistence] error', JSON.stringify({
            operation: 'load',
            message: error instanceof Error ? error.message : String(error),
          }));
        }
        console.error('[TravelMemory] Supabase 读取失败，暂时使用 IndexedDB 备份。', error);
        const local = await loadOrMigrateTravelState({ fallbackLocations, storageKey: STORAGE_KEY, normalizeLocation: migrateLocation });
        return { ...local, status: 'supabase-error', source: 'indexeddb-backup', error };
      }
    };
    loadFromSource()
      .then((result) => {
        if (cancelled) return;
        setLocations(Array.isArray(result.locations) ? result.locations : fallbackLocations);
        setStorageStatus(result.status || 'ready');
        updateSaveState({ syncStatus: result.status === 'supabase-error' ? 'sync-error' : (isSupabaseConfigured ? 'synced' : 'local') });
        setStorageReady(true);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('[TravelMemory] 数据恢复失败，本次仅使用默认数据。', error);
        setLocations(fallbackLocations);
        setStorageStatus('fallback');
        updateSaveState({ syncStatus: isSupabaseConfigured ? 'sync-error' : 'local' });
        setStorageReady(true);
      });
    return () => { cancelled = true; };
  }, [updateSaveState]);

  const persistOperations = useCallback(async (operations) => {
    if (!isSupabaseConfigured) {
      await persistIncrementalWrites(operations);
      return { syncStatus: 'local', storageStatus: 'ready', retryable: false };
    }
    const [remoteResult, localResult] = await Promise.allSettled([
      persistSupabaseOperations(operations),
      persistIncrementalWrites(operations),
    ]);
    if (remoteResult.status === 'fulfilled') {
      if (localResult.status === 'rejected') {
        console.error('[TravelMemory] Supabase 已保存，但 IndexedDB 本机备份写入失败。', localResult.reason);
      }
      return { syncStatus: 'synced', storageStatus: 'ready', retryable: false };
    }
    if (localResult.status === 'fulfilled') {
      return { syncStatus: 'local', storageStatus: 'supabase-error', retryable: true };
    }
    console.error('[TravelMemory] Supabase 与 IndexedDB 写入均失败。', {
      remoteError: remoteResult.reason,
      localError: localResult.reason,
    });
    throw remoteResult.reason;
  }, []);

  const persistPhotoMutationFromSource = useCallback(async (payload) => {
    if (!isSupabaseConfigured) {
      await persistPhotoMutation(payload);
      return { syncStatus: 'local', storageStatus: 'ready', retryable: false };
    }
    const [remoteResult, localResult] = await Promise.allSettled([
      persistSupabasePhotoMutation(payload),
      persistPhotoMutation(payload),
    ]);
    if (remoteResult.status === 'fulfilled') {
      if (localResult.status === 'rejected') {
        console.error('[PhotoPersistence] Supabase 已保存，但 IndexedDB 本机备份写入失败。', localResult.reason);
      }
      return { syncStatus: 'synced', storageStatus: 'ready', retryable: false };
    }
    if (localResult.status === 'fulfilled') {
      return { syncStatus: 'local', storageStatus: 'supabase-error', retryable: true };
    }
    console.error('[PhotoPersistence] Supabase 与 IndexedDB 写入均失败。', {
      remoteError: remoteResult.reason,
      localError: localResult.reason,
    });
    throw remoteResult.reason;
  }, []);

  const flushStorage = useCallback(async () => {
    if (flushPromiseRef.current) return flushPromiseRef.current;
    if (persistenceTimerRef.current) {
      window.clearTimeout(persistenceTimerRef.current);
      persistenceTimerRef.current = null;
    }
    const entries = [...pendingWritesRef.current.entries()];
    if (!entries.length) return true;
    const operations = resolvePendingOperations(entries, locationsRef.current);
    const revision = saveRevisionRef.current;
    beginSaveAttempt();
    const savePromise = (async () => {
      try {
        const result = await persistOperations(operations);
        if (!result.retryable) {
          entries.forEach(([key, entry]) => {
            if (pendingWritesRef.current.get(key) === entry) pendingWritesRef.current.delete(key);
          });
        }
        updateStorageStatusForSave(revision, result.storageStatus);
        finishSaveAttempt(revision, { success: true, syncStatus: result.syncStatus });
        return true;
      } catch (error) {
        updateStorageStatusForSave(revision, isSupabaseConfigured ? 'supabase-error' : 'fallback');
        finishSaveAttempt(revision, {
          success: false,
          syncStatus: 'sync-error',
          error: error instanceof Error ? error.message : String(error),
        });
        console.error('[TravelMemory] 增量数据保存失败，本次修改仍保留在内存中。', error);
        return false;
      }
    })();
    flushPromiseRef.current = savePromise;
    try {
      return await savePromise;
    } finally {
      if (flushPromiseRef.current === savePromise) flushPromiseRef.current = null;
    }
  }, [beginSaveAttempt, finishSaveAttempt, persistOperations, updateStorageStatusForSave]);

  const markDirty = useCallback(({ key, kind, action, locationId, tripId, photoId }) => {
    if (!key || !kind) return;
    const next = { key, kind, action, locationId, tripId, photoId };
    pendingWritesRef.current.set(key, mergePendingWrite(pendingWritesRef.current.get(key), next));
    noteSaveMutation();
    if (!persistenceTimerRef.current) {
      persistenceTimerRef.current = window.setTimeout(() => {
        persistenceTimerRef.current = null;
        void flushStorage();
      }, 420);
    }
  }, [flushStorage, noteSaveMutation]);

  const queueSyncRetry = useCallback((entries = []) => {
    entries.forEach((entry) => {
      if (!entry?.key || !entry?.kind) return;
      pendingWritesRef.current.set(entry.key, mergePendingWrite(pendingWritesRef.current.get(entry.key), entry));
    });
  }, []);

  const persistPhotoMutationNow = useCallback(async (payload, fallbackEntries = []) => {
    const revision = noteSaveMutation();
    beginSaveAttempt();
    try {
      const result = await persistPhotoMutationFromSource(payload);
      if (result.retryable) queueSyncRetry(fallbackEntries);
      updateStorageStatusForSave(revision, result.storageStatus);
      finishSaveAttempt(revision, { success: true, syncStatus: result.syncStatus });
      return true;
    } catch (error) {
      updateStorageStatusForSave(revision, isSupabaseConfigured ? 'supabase-error' : 'fallback');
      fallbackEntries.forEach((entry) => markDirty(entry));
      finishSaveAttempt(saveRevisionRef.current, {
        success: false,
        syncStatus: 'sync-error',
        error: error instanceof Error ? error.message : String(error),
      });
      console.error('[PhotoPersistence] immediate write failed', error);
      return false;
    }
  }, [beginSaveAttempt, finishSaveAttempt, markDirty, noteSaveMutation, persistPhotoMutationFromSource, queueSyncRetry, updateStorageStatusForSave]);

  useEffect(() => {
    if (!storageReady) return undefined;
    const flush = () => { void flushStorage(); };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [storageReady, flushStorage]);

  useEffect(() => {
    if (!storageReady) return;
    const flushOnNavigation = () => { void flushStorage(); };
    return () => { flushOnNavigation(); };
  }, [selectedId, viewMode, storageReady, flushStorage]);

  const openLocation = useCallback((id) => { setSelectedId(id); setPanelOpen(true); }, []);
  const selectLocation = useCallback((id) => { setSelectedId(id); }, []);
  const clearLocationSelection = useCallback(() => { setSelectedId(null); }, []);
  const closePanel = useCallback(() => { setPanelOpen(false); setSelectedId(null); }, []);
  const updateLocation = useCallback((id, u) => {
    const currentLocations = locationsRef.current;
    const currentLocation = currentLocations.find((location) => location.id === id);
    if (!currentLocation) return Promise.resolve(false);
    const nextLocation = { ...currentLocation, ...u };
    const nextLocations = currentLocations.map((location) => (location.id === id ? nextLocation : location));
    const entries = [
      { key: `location:${id}`, kind: 'location-put', action: 'updateLocation', locationId: id },
    ];
    let immediatePhotoChange = null;
    if (Array.isArray(u?.trips)) u.trips.forEach((trip) => {
      if (!trip?.id) return;
      entries.push({ key: `trip:${trip.id}`, kind: 'trip-put', action: 'updateLocation', locationId: id, tripId: trip.id });
      const previousTrip = currentLocation.trips?.find((item) => item.id === trip.id);
      const coverId = getPhotoAssetId(trip.coverPhoto);
      const previousCoverId = getPhotoAssetId(previousTrip?.coverPhoto);
      if (coverId) entries.push({
        key: `photo:${coverId}`,
        kind: photoNeedsBlobWrite(trip.coverPhoto) ? 'photo-asset' : 'photo-meta',
        action: 'updateLocation',
        locationId: id,
        tripId: trip.id,
        photoId: coverId,
      });
      if (previousCoverId && previousCoverId !== coverId) entries.push({
        key: `photo:${previousCoverId}`,
        kind: 'photo-delete',
        action: 'updateLocation',
        photoId: previousCoverId,
      });
      if (!immediatePhotoChange && (
        (coverId && photoNeedsBlobWrite(trip.coverPhoto))
        || (previousCoverId && !coverId)
      )) {
        immediatePhotoChange = {
          trip,
          photo: coverId ? trip.coverPhoto : null,
          deletePhotoIds: previousCoverId && previousCoverId !== coverId ? [previousCoverId] : [],
        };
      }
    });
    locationsRef.current = nextLocations;
    setLocations(nextLocations);
    if (immediatePhotoChange) {
      return persistPhotoMutationNow({
        action: 'updateLocationPhoto',
        location: nextLocation,
        trip: immediatePhotoChange.trip,
        photo: immediatePhotoChange.photo,
        locationId: id,
        tripId: immediatePhotoChange.trip.id,
        deletePhotoIds: immediatePhotoChange.deletePhotoIds,
      }, entries);
    }
    entries.forEach((entry) => markDirty(entry));
    return Promise.resolve(true);
  }, [markDirty, persistPhotoMutationNow]);
  const addLocation = useCallback((loc) => {
    const next = { ...loc, landscapeImages: [], landscapeImageMeta: [], landscapeImageAssetIds: [], trips: [], galleryTheme: loc.galleryTheme || 'midnight' };
    markDirty({ key: `location:${next.id}`, kind: 'location-put', action: 'addLocation', locationId: next.id });
    setLocations((p) => [...p, next]);
  }, [markDirty]);
  const deleteLocation = useCallback((id) => {
    const location = locationsRef.current.find((item) => item.id === id);
    const assetIds = new Set([
      ...(location?.landscapeImageAssetIds || []),
      ...(location?.landscapeImages || []).map(getPhotoAssetId),
      ...(location?.overviewHiddenImages || []).map(getPhotoAssetId),
    ].filter(Boolean));
    (location?.trips || []).forEach((trip) => collectTripAssetIds(trip).forEach((assetId) => assetIds.add(assetId)));
    markDirty({ key: `location:${id}`, kind: 'location-delete', action: 'deleteLocation', locationId: id });
    (location?.trips || []).forEach((trip) => {
      markDirty({ key: `trip:${trip.id}`, kind: 'trip-delete', action: 'deleteLocation', tripId: trip.id });
      collectTripAssetIds(trip).forEach((assetId) => markDirty({ key: `photo:${assetId}`, kind: 'photo-delete', action: 'deleteLocation', photoId: assetId }));
    });
    assetIds.forEach((assetId) => markDirty({ key: `photo:${assetId}`, kind: 'photo-delete', action: 'deleteLocation', photoId: assetId }));
    releaseRuntimeAssets([...assetIds]);
    setLocations((p) => p.filter((l) => l.id !== id));
    if (selectedId === id) closePanel();
  }, [selectedId, closePanel, markDirty]);
  const addLandscapeImage = useCallback((locId, img, meta = null) => {
    const assetId = img && typeof img === 'object' ? (img.assetId || `overview-${locId}-${newId()}`) : `overview-${locId}-${newId()}`;
    const imageUrl = img && typeof img === 'object'
      ? (img.url || (img.blob ? getRuntimeAssetUrl(assetId, img.blob) : ''))
      : img;
    const currentLocations = locationsRef.current;
    const currentLocation = currentLocations.find((location) => location.id === locId);
    if (!currentLocation) return Promise.resolve(false);
    const images = Array.isArray(currentLocation.landscapeImages) ? currentLocation.landscapeImages : [];
    const imageAssetIds = Array.isArray(currentLocation.landscapeImageAssetIds) ? [...currentLocation.landscapeImageAssetIds] : [];
    const imageMeta = Array.isArray(currentLocation.landscapeImageMeta)
      ? [...currentLocation.landscapeImageMeta]
      : Array(images.length).fill(null);
    const imageEntry = img && typeof img === 'object'
      ? { ...img, id: assetId, assetId, url: imageUrl }
      : imageUrl;
    imageMeta.push(meta);
    imageAssetIds.push(assetId);
    const nextLocation = {
      ...currentLocation,
      landscapeImages: [...images, imageEntry],
      landscapeImageMeta: imageMeta,
      landscapeImageAssetIds: imageAssetIds,
    };
    const nextLocations = currentLocations.map((location) => location.id === locId ? nextLocation : location);
    locationsRef.current = nextLocations;
    setLocations(nextLocations);
    const entries = [
      { key: `location:${locId}`, kind: 'location-put', action: 'addLandscapeImage', locationId: locId },
      { key: `photo:${assetId}`, kind: photoNeedsBlobWrite(img) ? 'photo-asset' : 'photo-meta', action: 'addLandscapeImage', locationId: locId, photoId: assetId },
    ];
    if (photoNeedsBlobWrite(img)) {
      return persistPhotoMutationNow({
        action: 'addLandscapeImage',
        location: nextLocation,
        photo: imageEntry,
        locationId: locId,
      }, entries);
    }
    entries.forEach((entry) => markDirty(entry));
    return Promise.resolve(true);
  }, [markDirty, persistPhotoMutationNow]);
  const replaceLandscapeImage = useCallback((locId, idx, img, meta = null) => {
    const assetId = img && typeof img === 'object' ? (img.assetId || `overview-${locId}-${newId()}`) : `overview-${locId}-${newId()}`;
    const imageUrl = img && typeof img === 'object' ? (img.url || (img.blob ? getRuntimeAssetUrl(assetId, img.blob) : '')) : img;
    const currentLocations = locationsRef.current;
    const currentLocation = currentLocations.find((location) => location.id === locId);
    if (!currentLocation) return Promise.resolve(false);
    const previousAssetId = currentLocation.landscapeImageAssetIds?.[idx];
    const images = [...(currentLocation.landscapeImages || [])];
    const imageMeta = [...(currentLocation.landscapeImageMeta || [])];
    const imageAssetIds = [...(currentLocation.landscapeImageAssetIds || [])];
    const imageEntry = img && typeof img === 'object'
      ? { ...img, id: assetId, assetId, url: imageUrl }
      : imageUrl;
    images[idx] = imageEntry;
    imageMeta[idx] = meta;
    imageAssetIds[idx] = assetId;
    const nextLocation = { ...currentLocation, landscapeImages: images, landscapeImageMeta: imageMeta, landscapeImageAssetIds: imageAssetIds };
    const nextLocations = currentLocations.map((location) => location.id === locId ? nextLocation : location);
    locationsRef.current = nextLocations;
    setLocations(nextLocations);
    if (previousAssetId && previousAssetId !== assetId) releaseRuntimeAsset(previousAssetId);
    const entries = [
      { key: `location:${locId}`, kind: 'location-put', action: 'replaceLandscapeImage', locationId: locId },
      { key: `photo:${assetId}`, kind: photoNeedsBlobWrite(img) ? 'photo-asset' : 'photo-meta', action: 'replaceLandscapeImage', locationId: locId, photoId: assetId },
    ];
    if (previousAssetId && previousAssetId !== assetId) entries.push({ key: `photo:${previousAssetId}`, kind: 'photo-delete', action: 'replaceLandscapeImage', photoId: previousAssetId });
    if (photoNeedsBlobWrite(img)) {
      return persistPhotoMutationNow({
        action: 'replaceLandscapeImage',
        location: nextLocation,
        photo: imageEntry,
        locationId: locId,
        deletePhotoIds: previousAssetId && previousAssetId !== assetId ? [previousAssetId] : [],
      }, entries);
    }
    entries.forEach((entry) => markDirty(entry));
    return Promise.resolve(true);
  }, [markDirty, persistPhotoMutationNow]);
  const removeLandscapeImage = useCallback((locId, idx) => {
    const currentLocation = locationsRef.current.find((location) => location.id === locId);
    const assetId = currentLocation?.landscapeImageAssetIds?.[idx];
    markDirty({ key: `location:${locId}`, kind: 'location-put', action: 'removeLandscapeImage', locationId: locId });
    if (assetId) markDirty({ key: `photo:${assetId}`, kind: 'photo-delete', action: 'removeLandscapeImage', photoId: assetId });
    setLocations((p) => p.map((l) => {
      if (l.id !== locId) return l;
      const previousAssetId = l.landscapeImageAssetIds?.[idx];
      if (previousAssetId) releaseRuntimeAsset(previousAssetId);
      return {
        ...l,
        landscapeImages: (l.landscapeImages || []).filter((_, i) => i !== idx),
        landscapeImageMeta: (l.landscapeImageMeta || []).filter((_, i) => i !== idx),
        landscapeImageAssetIds: (l.landscapeImageAssetIds || []).filter((_, i) => i !== idx),
      };
    }));
  }, [markDirty]);

  // Trip
  const addTrip = useCallback((locId, startDate, endDate, name) => {
    const normalizedStartDate = formatCalendarDate(startDate);
    const normalizedEndDate = formatCalendarDate(endDate);
    if (!normalizedStartDate || !normalizedEndDate) return null;
    const trip = {
      id: newId(),
      name: name || '未命名旅程',
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      photos: [],
      photosMigrated: true,
      days: generateDays(normalizedStartDate, normalizedEndDate),
    };
    markDirty({ key: `location:${locId}`, kind: 'location-put', action: 'addTrip', locationId: locId });
    markDirty({ key: `trip:${trip.id}`, kind: 'trip-put', action: 'addTrip', locationId: locId, tripId: trip.id });
    const nextLocations = locationsRef.current.map((location) => (
      location.id === locId
        ? { ...location, trips: [...location.trips, trip].sort((a, b) => a.startDate.localeCompare(b.startDate)) }
        : location
    ));
    locationsRef.current = nextLocations;
    setLocations(nextLocations);
    return trip.id;
  }, [markDirty]);
  const createTripForLocation = useCallback(({ existingLocationId, location: locationInput, startDate, endDate, name }) => {
    const normalizedStartDate = formatCalendarDate(startDate);
    const normalizedEndDate = formatCalendarDate(endDate);
    if (!normalizedStartDate || !normalizedEndDate || normalizedEndDate < normalizedStartDate) return null;

    const currentLocations = locationsRef.current;
    const existingLocation = existingLocationId
      ? currentLocations.find((item) => item.id === existingLocationId)
      : null;
    if (existingLocationId && !existingLocation) return null;
    if (!existingLocation && !locationInput?.id) return null;

    const trip = {
      id: newId(),
      name: name || '未命名旅程',
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      photos: [],
      photosMigrated: true,
      days: generateDays(normalizedStartDate, normalizedEndDate),
    };
    const nextLocation = existingLocation
      ? {
        ...existingLocation,
        trips: [...(existingLocation.trips || []), trip].sort((a, b) => a.startDate.localeCompare(b.startDate)),
      }
      : {
        ...locationInput,
        landscapeImages: [],
        landscapeImageMeta: [],
        landscapeImageAssetIds: [],
        trips: [trip],
        galleryTheme: locationInput.galleryTheme || 'midnight',
      };
    const nextLocations = existingLocation
      ? currentLocations.map((item) => item.id === existingLocation.id ? nextLocation : item)
      : [...currentLocations, nextLocation];

    locationsRef.current = nextLocations;
    setLocations(nextLocations);
    markDirty({ key: `location:${nextLocation.id}`, kind: 'location-put', action: 'createTripForLocation', locationId: nextLocation.id });
    markDirty({ key: `trip:${trip.id}`, kind: 'trip-put', action: 'createTripForLocation', locationId: nextLocation.id, tripId: trip.id });
    return { locationId: nextLocation.id, tripId: trip.id };
  }, [markDirty]);
  const deleteTrip = useCallback((locId, tripId) => {
    const trip = locationsRef.current.find((location) => location.id === locId)?.trips?.find((item) => item.id === tripId);
    markDirty({ key: `location:${locId}`, kind: 'location-put', action: 'deleteTrip', locationId: locId });
    markDirty({ key: `trip:${tripId}`, kind: 'trip-delete', action: 'deleteTrip', locationId: locId, tripId });
    collectTripAssetIds(trip).forEach((assetId) => markDirty({ key: `photo:${assetId}`, kind: 'photo-delete', action: 'deleteTrip', photoId: assetId }));
    releaseRuntimeAssets([...collectTripAssetIds(trip)]);
    setLocations((p) => p.map((l) => l.id === locId ? { ...l, trips: l.trips.filter((t) => t.id !== tripId) } : l));
  }, [markDirty]);

  // Day
  const addDayToTrip = useCallback((locId, tripId, date) => {
    const day = createEmptyDay(date);
    markDirty({ key: `trip:${tripId}`, kind: 'trip-put', action: 'addDay', locationId: locId, tripId });
    setLocations((p) => p.map((l) => {
      if (l.id !== locId) return l;
      const trips = l.trips.map((t) => {
        if (t.id !== tripId) return t;
        const days = [...t.days, day].sort((a, b) => a.date.localeCompare(b.date));
        const dates = days.map((d) => d.date).sort();
        return { ...t, startDate: dates[0], endDate: dates[dates.length - 1], days };
      });
      return { ...l, trips };
    }));
    return day.id;
  }, [markDirty]);
  const deleteDay = useCallback((locId, tripId, dayId) => {
    markDirty({ key: `trip:${tripId}`, kind: 'trip-put', action: 'deleteDay', locationId: locId, tripId });
    setLocations((p) => p.map((l) => {
      if (l.id !== locId) return l;
      const trips = l.trips.map((t) => {
        if (t.id !== tripId) return t;
        const days = t.days.filter((d) => d.id !== dayId);
        if (days.length === 0) return null;
        const dates = days.map((d) => d.date).sort();
        return { ...t, startDate: dates[0], endDate: dates[dates.length - 1], days };
      }).filter(Boolean);
      return { ...l, trips };
    }));
  }, [markDirty]);

  // Block
  const addBlock = useCallback((locId, dayId, type) => {
    const block = createBlock(type);
    const tripId = locationsRef.current.find((location) => location.id === locId)?.trips?.find((trip) => trip.days?.some((day) => day.id === dayId))?.id;
    if (tripId) markDirty({ key: `trip:${tripId}`, kind: 'trip-put', action: 'addBlock', locationId: locId, tripId });
    setLocations((p) => p.map((l) => (l.id !== locId ? l : {
      ...l,
      trips: l.trips.map((t) => ({
        ...t,
        days: t.days.map((d) => (d.id === dayId ? {
          ...d,
          blocks: [...d.blocks, block].sort((a, b) =>
            (BLOCK_DEFS[a.type]?.order ?? 99) - (BLOCK_DEFS[b.type]?.order ?? 99)
          ),
        } : d)),
      })),
    })));
    return block.id;
  }, [markDirty]);
  const removeBlock = useCallback((locId, dayId, blockId) => {
    const tripId = locationsRef.current.find((location) => location.id === locId)?.trips?.find((trip) => trip.days?.some((day) => day.id === dayId))?.id;
    if (tripId) markDirty({ key: `trip:${tripId}`, kind: 'trip-put', action: 'removeBlock', locationId: locId, tripId });
    setLocations((p) => p.map((l) => (l.id !== locId ? l : {
      ...l,
      trips: l.trips.map((t) => ({
        ...t,
        days: t.days.map((d) => (d.id === dayId ? { ...d, blocks: d.blocks.filter((b) => b.id !== blockId) } : d)),
      })),
    })));
  }, [markDirty]);
  const updateBlockTitle = useCallback((locId, dayId, blockId, title) => {
    const tripId = locationsRef.current.find((location) => location.id === locId)?.trips?.find((trip) => trip.days?.some((day) => day.id === dayId))?.id;
    if (tripId) markDirty({ key: `trip:${tripId}`, kind: 'trip-put', action: 'updateBlockTitle', locationId: locId, tripId });
    setLocations((p) => p.map((l) => (l.id !== locId ? l : {
      ...l,
      trips: l.trips.map((t) => ({
        ...t,
        days: t.days.map((d) => (d.id === dayId ? { ...d, blocks: d.blocks.map((b) => (b.id === blockId ? { ...b, title } : b)) } : d)),
      })),
    })));
  }, [markDirty]);
  const updateBlockData = useCallback((locId, dayId, blockId, data) => {
    const tripId = locationsRef.current.find((location) => location.id === locId)?.trips?.find((trip) => trip.days?.some((day) => day.id === dayId))?.id;
    if (tripId) markDirty({ key: `trip:${tripId}`, kind: 'trip-put', action: 'updateBlockData', locationId: locId, tripId });
    setLocations((p) => p.map((l) => (l.id !== locId ? l : {
      ...l,
      trips: l.trips.map((t) => ({
        ...t,
        days: t.days.map((d) => (d.id === dayId ? { ...d, blocks: d.blocks.map((b) => (b.id === blockId ? { ...b, data: { ...b.data, ...data } } : b)) } : d)),
      })),
    })));
  }, [markDirty]);

  // Central film photos belong to a trip. The legacy day helpers below remain
  // available for older journal blocks, while the film view uses these IDs.
  const addTripPhoto = useCallback((locId, tripId, photo) => {
    const source = photo || {};
    const id = source.id || newId();
    const assetId = source.assetId || id;
    const nextPhoto = { ...source, id, assetId, url: source.url || (source.blob ? getRuntimeAssetUrl(assetId, source.blob) : '') };
    const currentLocations = locationsRef.current;
    const currentLocation = currentLocations.find((location) => location.id === locId);
    const currentTrip = currentLocation?.trips?.find((trip) => trip.id === tripId);
    if (!currentLocation || !currentTrip) return Promise.resolve(false);
    const nextTrip = {
      ...currentTrip,
      photos: [...(Array.isArray(currentTrip.photos) ? currentTrip.photos : []), nextPhoto],
      photosMigrated: true,
    };
    const nextLocations = currentLocations.map((location) => location.id !== locId ? location : {
      ...location,
      trips: location.trips.map((trip) => trip.id === tripId ? nextTrip : trip),
    });
    locationsRef.current = nextLocations;
    setLocations(nextLocations);
    return persistPhotoMutationNow({
      action: 'addTripPhoto',
      location: nextLocations.find((location) => location.id === locId),
      trip: nextTrip,
      photo: nextPhoto,
      locationId: locId,
      tripId,
    }, [
      { key: `trip:${tripId}`, kind: 'trip-put', action: 'addTripPhoto', locationId: locId, tripId },
      { key: `photo:${assetId}`, kind: 'photo-asset', action: 'addTripPhoto', locationId: locId, tripId, photoId: assetId },
    ]);
  }, [persistPhotoMutationNow]);
  const updateTripPhoto = useCallback((locId, tripId, photoId, updates) => {
    const currentLocations = locationsRef.current;
    const currentTrip = currentLocations.find((location) => location.id === locId)?.trips?.find((trip) => trip.id === tripId);
    const photoIndex = currentTrip?.photos?.findIndex((photo, index) => normalizeTripPhoto(photo, stableId('photo', tripId, index))?.id === photoId) ?? -1;
    if (photoIndex < 0) return false;
    const originalPhoto = normalizeTripPhoto(currentTrip.photos[photoIndex], stableId('photo', tripId, photoIndex));
    const updatedPhoto = { ...originalPhoto, ...updates };
    const assetId = getPhotoAssetId(originalPhoto);
    const nextTrip = {
      ...currentTrip,
      photos: currentTrip.photos.map((photo, index) => index === photoIndex ? updatedPhoto : photo),
      photosMigrated: true,
      days: (currentTrip.days || []).map((day) => ({
        ...day,
        blocks: (day.blocks || []).map((block) => block.type !== 'photos' ? block : {
          ...block,
          data: {
            ...block.data,
            photos: (block.data?.photos || []).map((reference) => {
              const referenceId = getPhotoAssetId(reference);
              const matches = referenceId === assetId || (!referenceId && photoReferenceMatches(reference, originalPhoto, photoId));
              return matches ? { ...(typeof reference === 'object' ? reference : updatedPhoto), ...updates } : reference;
            }),
          },
        }),
      })),
    };
    const nextLocations = currentLocations.map((location) => location.id !== locId ? location : {
      ...location,
      trips: location.trips.map((trip) => trip.id === tripId ? nextTrip : trip),
    });
    locationsRef.current = nextLocations;
    setLocations(nextLocations);
    markDirty({ key: `trip:${tripId}`, kind: 'trip-put', action: 'updateTripPhoto', locationId: locId, tripId });
    markDirty({ key: `photo:${assetId}`, kind: 'photo-meta', action: 'updateTripPhoto', locationId: locId, tripId, photoId: assetId });
    return true;
  }, [markDirty]);
  const movePhotoToDay = useCallback(async (locId, tripId, photoId, targetDayId) => {
    const saveWasInFlight = Boolean(flushPromiseRef.current);
    const originalLocations = locationsRef.current;
    const location = originalLocations.find((item) => item.id === locId);
    const trip = location?.trips?.find((item) => item.id === tripId);
    if (!trip || !trip.days?.some((day) => day.id === targetDayId)) return false;
    const nextTrip = movePhotoReferencesInTrip(trip, photoId, targetDayId);
    if (!nextTrip) return false;
    const movedPhoto = nextTrip.photos.find((photo, index) => normalizeTripPhoto(photo, stableId('photo', tripId, index))?.id === photoId);
    if (!movedPhoto) return false;
    const nextLocation = { ...location, trips: location.trips.map((item) => item.id === tripId ? nextTrip : item) };
    const nextLocations = originalLocations.map((item) => item.id === locId ? nextLocation : item);
    locationsRef.current = nextLocations;
    setLocations(nextLocations);
    markDirty({ key: `trip:${tripId}`, kind: 'trip-put', action: 'movePhotoToDay', locationId: locId, tripId });
    markDirty({ key: `photo:${photoId}`, kind: 'photo-meta', action: 'movePhotoToDay', locationId: locId, tripId, photoId });

    const firstSave = await flushStorage();
    const saveSucceeded = firstSave && (!saveWasInFlight || await flushStorage());
    if (saveSucceeded) return true;

    // Restore only the moved photo and its day references. Failed writes remain queued,
    // so a later retry resolves those trip/photo keys against the restored state.
    const latestLocations = locationsRef.current;
    const latestLocation = latestLocations.find((item) => item.id === locId);
    const latestTrip = latestLocation?.trips?.find((item) => item.id === tripId);
    const restoredTrip = restorePhotoMoveInTrip(latestTrip, trip, photoId);
    const restoredLocation = latestLocation && restoredTrip
      ? { ...latestLocation, trips: latestLocation.trips.map((item) => item.id === tripId ? restoredTrip : item) }
      : null;
    const restoredLocations = restoredLocation
      ? latestLocations.map((item) => item.id === locId ? restoredLocation : item)
      : originalLocations;
    locationsRef.current = restoredLocations;
    setLocations(restoredLocations);
    return false;
  }, [flushStorage, markDirty]);
  const removeTripPhoto = useCallback((locId, tripId, photoId) => {
    const trip = locationsRef.current.find((location) => location.id === locId)?.trips?.find((item) => item.id === tripId);
    const removedPhoto = trip?.photos?.find((photo) => photo?.id === photoId);
    markDirty({ key: `trip:${tripId}`, kind: 'trip-put', action: 'removeTripPhoto', locationId: locId, tripId });
    markDirty({ key: `photo:${photoId}`, kind: 'photo-delete', action: 'removeTripPhoto', photoId });
    if (removedPhoto) releaseRuntimeAsset(removedPhoto.assetId || removedPhoto.id);
    setLocations((p) => p.map((l) => l.id !== locId ? l : {
      ...l,
      trips: l.trips.map((t) => t.id !== tripId ? t : {
        ...t,
        photos: (Array.isArray(t.photos) ? t.photos : []).filter((photo, index) => {
          const normalized = normalizeTripPhoto(photo, stableId('photo', tripId, index));
          return normalized?.id !== photoId;
        }),
        photosMigrated: true,
      }),
    }));
  }, [markDirty]);

  // Photo & meal helpers
  const addDayPhoto = useCallback((locId, dayId, photo) => {
    const currentLocations = locationsRef.current;
    const trip = currentLocations.find((location) => location.id === locId)?.trips?.find((item) => (item.days || []).some((day) => day.id === dayId));
    if (!trip) return;
    const source = photo || {};
    const id = source.id || newId();
    const assetId = source.assetId || id;
    const nextPhoto = {
      ...source,
      id,
      assetId,
      url: source.url || (source.blob ? getRuntimeAssetUrl(assetId, source.blob) : ''),
      source: source.source || 'photo',
      dayId,
    };
    markDirty({ key: `trip:${trip.id}`, kind: 'trip-put', action: 'addDayPhoto', locationId: locId, tripId: trip.id });
    markDirty({ key: `photo:${assetId}`, kind: photoNeedsBlobWrite(nextPhoto) ? 'photo-asset' : 'photo-meta', action: 'addDayPhoto', locationId: locId, tripId: trip.id, photoId: assetId });
    const nextLocations = currentLocations.map((l) => (l.id !== locId ? l : {
      ...l,
      trips: l.trips.map((t) => {
        if (!(t.days || []).some((day) => day.id === dayId)) return t;
        const existingPhotos = Array.isArray(t.photos) ? t.photos : [];
        const photos = existingPhotos.some((item) => item?.id === id)
          ? existingPhotos
          : [...existingPhotos, nextPhoto];
        return {
          ...t,
          photos,
          photosMigrated: true,
          days: t.days.map((d) => (d.id === dayId ? {
            ...d,
            blocks: d.blocks.map((b) => (b.type === 'photos'
              ? { ...b, data: { ...b.data, photos: [...(b.data.photos || []), nextPhoto] } }
              : b)),
          } : d)),
        };
      }),
    }));
    locationsRef.current = nextLocations;
    setLocations(nextLocations);
    if (photoNeedsBlobWrite(nextPhoto)) {
      const nextTrip = nextLocations.find((location) => location.id === locId)?.trips?.find((item) => item.id === trip.id);
      return persistPhotoMutationNow({
        action: 'addDayPhoto',
        location: nextLocations.find((location) => location.id === locId),
        trip: nextTrip,
        photo: nextPhoto,
        locationId: locId,
        tripId: trip.id,
      }, [
        { key: `trip:${trip.id}`, kind: 'trip-put', action: 'addDayPhoto', locationId: locId, tripId: trip.id },
        { key: `photo:${assetId}`, kind: 'photo-asset', action: 'addDayPhoto', locationId: locId, tripId: trip.id, photoId: assetId },
      ]);
    }
    return Promise.resolve(true);
  }, [markDirty, persistPhotoMutationNow]);
  const updateDayPhoto = useCallback((locId, dayId, idx, updates) => {
    const trip = locationsRef.current.find((location) => location.id === locId)?.trips?.find((item) => (item.days || []).some((day) => day.id === dayId));
    const currentPhoto = trip?.days?.find((day) => day.id === dayId)?.blocks?.find((block) => block.type === 'photos')?.data?.photos?.[idx];
    const photoId = getPhotoAssetId(currentPhoto);
    if (trip) markDirty({ key: `trip:${trip.id}`, kind: 'trip-put', action: 'updateDayPhoto', locationId: locId, tripId: trip.id });
    if (trip && photoId) markDirty({ key: `photo:${photoId}`, kind: 'photo-meta', action: 'updateDayPhoto', locationId: locId, tripId: trip.id, photoId });
    setLocations((p) => p.map((l) => (l.id !== locId ? l : {
      ...l,
      trips: l.trips.map((t) => {
        let updatedPhotoId = null;
        const days = t.days.map((d) => (d.id !== dayId ? d : {
          ...d,
          blocks: d.blocks.map((b) => {
            if (b.type !== 'photos') return b;
            const photos = b.data.photos || [];
            return {
              ...b,
              data: {
                ...b.data,
                photos: photos.map((photo, photoIndex) => {
                  if (photoIndex !== idx) return photo;
                  const base = typeof photo === 'string' ? { url: photo } : (photo || {});
                  updatedPhotoId = base.id || null;
                  return { ...base, ...updates };
                }),
              },
            };
          }),
        }));
        if (!updatedPhotoId) return { ...t, days };
        return {
          ...t,
          days,
          photosMigrated: true,
          photos: (t.photos || []).map((photo, photoIndex) => {
            const normalized = normalizeTripPhoto(photo, stableId('photo', t.id, photoIndex));
            return normalized?.id === updatedPhotoId ? { ...normalized, ...updates } : normalized;
          }).filter(Boolean),
        };
      }),
    })));
  }, [markDirty]);
  const removeDayPhoto = useCallback((locId, dayId, idx) => {
    const day = locationsRef.current.find((location) => location.id === locId)?.trips
      ?.flatMap((trip) => trip.days || []).find((item) => item.id === dayId);
    const removedPhoto = day?.blocks?.find((block) => block.type === 'photos')?.data?.photos?.[idx];
    const trip = locationsRef.current.find((location) => location.id === locId)?.trips?.find((item) => (item.days || []).some((itemDay) => itemDay.id === dayId));
    const photoId = getPhotoAssetId(removedPhoto);
    if (trip) markDirty({ key: `trip:${trip.id}`, kind: 'trip-put', action: 'removeDayPhoto', locationId: locId, tripId: trip.id });
    if (photoId) markDirty({ key: `photo:${photoId}`, kind: 'photo-delete', action: 'removeDayPhoto', photoId });
    if (removedPhoto?.assetId || removedPhoto?.id) releaseRuntimeAsset(removedPhoto.assetId || removedPhoto.id);
    setLocations((p) => p.map((l) => (l.id !== locId ? l : {
      ...l,
      trips: l.trips.map((t) => {
        let removedPhoto = null;
        const days = t.days.map((d) => (d.id === dayId ? {
          ...d,
          blocks: d.blocks.map((b) => {
            if (b.type !== 'photos') return b;
            const photos = b.data.photos || [];
            removedPhoto = photos[idx] || null;
            return { ...b, data: { ...b.data, photos: photos.filter((_, i) => i !== idx) } };
          }),
        } : d));
        const removedId = removedPhoto?.id;
        return {
          ...t,
          days,
          photosMigrated: true,
          photos: removedId
            ? (t.photos || []).filter((photo, photoIndex) => normalizeTripPhoto(photo, stableId('photo', t.id, photoIndex))?.id !== removedId)
            : t.photos,
        };
      }),
    })));
  }, [markDirty]);
  const setMealPhoto = useCallback((locId, dayId, slotIdx, mealType, photoUrl) => {
    const currentLocations = locationsRef.current;
    const trip = currentLocations.find((location) => location.id === locId)?.trips?.find((item) => (item.days || []).some((day) => day.id === dayId));
    if (!trip) return;
    const previousValue = trip.days.find((day) => day.id === dayId)?.blocks
      ?.find((block) => block.type === 'itinerary')?.data?.slots?.[slotIdx]?.[mealType];
    const source = photoUrl && typeof photoUrl === 'object' ? photoUrl : photoUrl ? { url: photoUrl } : null;
    const id = source ? (source.id || newId()) : null;
    const assetId = id ? (source.assetId || id) : null;
    const previousPhoto = (trip.photos || []).find((photo) => photo?.url === previousValue);
    const nextPhoto = source ? {
      ...source,
      id,
      assetId,
      url: source.url || (source.blob ? getRuntimeAssetUrl(assetId, source.blob) : ''),
      source: 'meal',
      dayId,
      sourceIndex: slotIdx,
      mealType,
    } : null;
    markDirty({ key: `trip:${trip.id}`, kind: 'trip-put', action: 'setMealPhoto', locationId: locId, tripId: trip.id });
    if (previousPhoto?.id) markDirty({ key: `photo:${previousPhoto.id}`, kind: 'photo-delete', action: 'setMealPhoto', photoId: previousPhoto.id });
    if (nextPhoto) markDirty({ key: `photo:${assetId}`, kind: photoNeedsBlobWrite(nextPhoto) ? 'photo-asset' : 'photo-meta', action: 'setMealPhoto', locationId: locId, tripId: trip.id, photoId: assetId });
    const nextLocations = currentLocations.map((l) => (l.id !== locId ? l : {
      ...l,
      trips: l.trips.map((t) => {
        if (!(t.days || []).some((day) => day.id === dayId)) return t;
        const retainedPhotos = (t.photos || []).filter((photo) => photo?.id !== previousPhoto?.id);
        const photos = nextPhoto
          ? [...retainedPhotos.filter((photo) => photo?.id !== nextPhoto.id), nextPhoto]
          : retainedPhotos;
        const days = t.days.map((d) => (d.id === dayId ? { ...d, blocks: d.blocks.map((b) => {
          if (b.type !== 'itinerary') return b;
          const slots = (b.data.slots || []).map((slot, i) => (i === slotIdx ? { ...slot, [mealType]: nextPhoto?.url || null } : { ...slot }));
          const mealPhotoEdits = { ...(b.data.mealPhotoEdits || {}) };
          delete mealPhotoEdits[slotIdx + ':' + mealType];
          return { ...b, data: { ...b.data, slots, mealPhotoEdits } };
        }) } : d));
        return { ...t, photos, photosMigrated: true, days };
      }),
    }));
    locationsRef.current = nextLocations;
    setLocations(nextLocations);
    if (nextPhoto && photoNeedsBlobWrite(nextPhoto)) {
      const nextTrip = nextLocations.find((location) => location.id === locId)?.trips?.find((item) => item.id === trip.id);
      return persistPhotoMutationNow({
        action: 'setMealPhoto',
        location: nextLocations.find((location) => location.id === locId),
        trip: nextTrip,
        photo: nextPhoto,
        locationId: locId,
        tripId: trip.id,
        deletePhotoIds: previousPhoto?.id ? [previousPhoto.id] : [],
      }, [
        { key: `trip:${trip.id}`, kind: 'trip-put', action: 'setMealPhoto', locationId: locId, tripId: trip.id },
        { key: `photo:${assetId}`, kind: 'photo-asset', action: 'setMealPhoto', locationId: locId, tripId: trip.id, photoId: assetId },
      ]);
    }
    return Promise.resolve(true);
  }, [markDirty, persistPhotoMutationNow]);
  const updateMealPhoto = useCallback((locId, dayId, slotIdx, mealType, updates) => {
    const trip = locationsRef.current.find((location) => location.id === locId)?.trips?.find((item) => (item.days || []).some((day) => day.id === dayId));
    if (trip) markDirty({ key: `trip:${trip.id}`, kind: 'trip-put', action: 'updateMealPhoto', locationId: locId, tripId: trip.id });
    setLocations((p) => p.map((l) => (l.id !== locId ? l : {
      ...l,
      trips: l.trips.map((t) => ({
        ...t,
        days: t.days.map((d) => (d.id !== dayId ? d : {
          ...d,
          blocks: d.blocks.map((b) => {
            if (b.type !== 'itinerary') return b;
            const slot = (b.data.slots || [])[slotIdx];
            if (!slot?.[mealType]) return b;
            const key = slotIdx + ':' + mealType;
            return {
              ...b,
              data: {
                ...b.data,
                mealPhotoEdits: {
                  ...(b.data.mealPhotoEdits || {}),
                  [key]: { ...(b.data.mealPhotoEdits?.[key] || {}), ...updates },
                },
              },
            };
          }),
        })),
      })),
    })));
  }, [markDirty]);
  const updateItinerarySlot = useCallback((locId, dayId, slotIdx, text) => {
    const tripId = locationsRef.current.find((location) => location.id === locId)?.trips?.find((trip) => trip.days?.some((day) => day.id === dayId))?.id;
    if (tripId) markDirty({ key: `trip:${tripId}`, kind: 'trip-put', action: 'updateItinerarySlot', locationId: locId, tripId });
    setLocations((p) => p.map((l) => (l.id !== locId ? l : {
      ...l,
      trips: l.trips.map((t) => ({
        ...t,
        days: t.days.map((d) => (d.id === dayId ? { ...d, blocks: d.blocks.map((b) => {
          if (b.type !== 'itinerary') return b;
          const slots = (b.data.slots || []).map((slot, i) => (i === slotIdx ? { ...slot, text } : { ...slot }));
          return { ...b, data: { ...b.data, slots } };
        }) } : d)),
      })),
    })));
  }, [markDirty]);

  const contextValue = useMemo(() => ({
    locations, storageReady, storageStatus, saveState, flushStorage, selectedId, panelOpen, viewMode, footprintMode,
    openLocation, selectLocation, clearLocationSelection, closePanel, setViewMode, setFootprintMode,
    addLocation, updateLocation, deleteLocation, addLandscapeImage, replaceLandscapeImage, removeLandscapeImage,
    addTrip, createTripForLocation, deleteTrip, addDayToTrip, deleteDay,
    addBlock, removeBlock, updateBlockTitle, updateBlockData,
    addTripPhoto, updateTripPhoto, movePhotoToDay, removeTripPhoto,
    addDayPhoto, updateDayPhoto, removeDayPhoto, setMealPhoto, updateMealPhoto, updateItinerarySlot,
  }), [
    locations, storageReady, storageStatus, saveState, flushStorage, selectedId, panelOpen, viewMode, footprintMode,
    openLocation, selectLocation, clearLocationSelection, closePanel, setViewMode, setFootprintMode,
    addLocation, updateLocation, deleteLocation, addLandscapeImage, replaceLandscapeImage, removeLandscapeImage,
    addTrip, createTripForLocation, deleteTrip, addDayToTrip, deleteDay,
    addBlock, removeBlock, updateBlockTitle, updateBlockData,
    addTripPhoto, updateTripPhoto, movePhotoToDay, removeTripPhoto,
    addDayPhoto, updateDayPhoto, removeDayPhoto, setMealPhoto, updateMealPhoto, updateItinerarySlot,
  ]);

  return (
    <TravelContext.Provider value={contextValue}>
      {children}
    </TravelContext.Provider>
  );
}

export function useTravel() {
  const ctx = useContext(TravelContext);
  if (!ctx) throw new Error('useTravel must be used within TravelProvider');
  return ctx;
}

