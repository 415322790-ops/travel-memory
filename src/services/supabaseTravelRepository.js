import {
  getSupabaseUser,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabaseClient';
import { readStoredTravelSnapshot } from '../storage/travelDb';
import {
  cloudPhotoFromRow,
  hydrateCloudPhoto,
  hydrateCloudTripPhotos,
} from '../utils/cloudPhotoHydration';

export const PHOTO_BUCKET = 'travel-photos';

const SIGNED_URL_TTL_SECONDS = 3600;
const signedUrlCache = new Map();
const malformedPhotoReferenceWarnings = new Set();

function reportSupabaseError(operation, error) {
  if (!import.meta.env.DEV) return;
  console.error('[SupabasePersistence] error', JSON.stringify({
    operation,
    message: error instanceof Error ? error.message : String(error),
  }));
}

function isBlob(value) {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isEphemeralUrl(value) {
  return typeof value === 'string' && (value.startsWith('blob:') || value.startsWith('data:'));
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function photoIdOf(photo) {
  if (typeof photo === 'string') return isEphemeralUrl(photo) ? '' : photo;
  if (!photo) return '';
  return photo.assetId || photo.id || '';
}

function photoReferenceList(value, source) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => photoReferenceList(item, source));
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (typeof value === 'object') {
    if (photoIdOf(value) || value.sourceUrl) return [value];
    if (value.photos != null || value.photoIds != null) {
      return photoReferenceList(value.photos ?? value.photoIds, source);
    }
  }
  if (import.meta.env.DEV) {
    const type = value === null ? 'null' : typeof value;
    if (!malformedPhotoReferenceWarnings.has(`${source}:${type}`)) {
      malformedPhotoReferenceWarnings.add(`${source}:${type}`);
      console.warn(`[SupabasePersistence] skipped malformed ${source} (${type})`);
    }
  }
  return [];
}

function stablePhotoRef(photo) {
  if (!photo) return null;
  if (typeof photo === 'string') return isEphemeralUrl(photo) ? null : photo;
  const id = photoIdOf(photo);
  const next = cloneJson(photo) || {};
  delete next.blob;
  delete next.url;
  delete next.src;
  delete next.dataUrl;
  delete next.previewUrl;
  if (id) {
    next.id = id;
    next.assetId = id;
  }
  if (photo.sourceUrl && !isEphemeralUrl(photo.sourceUrl)) next.sourceUrl = photo.sourceUrl;
  return id || next.sourceUrl ? next : null;
}

function stableDay(day) {
  const next = cloneJson(day) || {};
  next.blocks = (Array.isArray(day?.blocks) ? day.blocks : []).map((block) => {
    const result = cloneJson(block) || {};
    if (block?.type === 'photos') {
      result.data = {
        ...(cloneJson(block.data) || {}),
        photos: photoReferenceList(block.data?.photos, 'Day photos').map(stablePhotoRef).filter(Boolean),
      };
    }
    if (block?.type === 'itinerary') {
      result.data = cloneJson(block.data) || {};
      result.data.slots = (block.data?.slots || []).map((slot) => {
        const nextSlot = cloneJson(slot) || {};
        ['breakfast', 'lunch', 'dinner'].forEach((mealType) => {
          if (slot?.[mealType]) nextSlot[mealType] = stablePhotoRef(slot[mealType]);
        });
        return nextSlot;
      });
    }
    return result;
  });
  return next;
}

function stableTrip(trip) {
  const next = cloneJson(trip) || {};
  const photoRefs = Array.isArray(trip?.photos) && trip.photos.length ? trip.photos : (trip?.photoIds || []);
  next.photos = photoReferenceList(photoRefs, 'Trip photos').map(stablePhotoRef).filter(Boolean);
  next.days = (Array.isArray(trip?.days) ? trip.days : []).map(stableDay);
  const cover = stablePhotoRef(trip?.coverPhoto || trip?.coverPhotoRef || null);
  next.coverPhoto = cover;
  next.coverPhotoRef = photoIdOf(cover) || (typeof cover === 'string' ? cover : null);
  next.photoIds = [...new Set([
    ...next.photos.map(photoIdOf),
    next.coverPhotoRef,
    ...next.days.flatMap((day) => day.blocks.flatMap((block) => {
      if (block.type === 'photos') return (block.data?.photos || []).map(photoIdOf);
      if (block.type !== 'itinerary') return [];
      return (block.data?.slots || []).flatMap((slot) => ['breakfast', 'lunch', 'dinner'].map((mealType) => photoIdOf(slot?.[mealType])));
    })),
  ].filter(Boolean))];
  return next;
}

function stableLocation(location) {
  const next = cloneJson(location) || {};
  delete next.trips;
  delete next.landscapeImages;
  delete next.landscapeImage;
  delete next.overviewHiddenImages;
  const sourceLandscapeRefs = location?.landscapeImages?.length
    ? location.landscapeImages
    : (location?.landscapeImageRefs || []);
  next.landscapeImageRefs = sourceLandscapeRefs.map((photo) => {
    const ref = stablePhotoRef(photo);
    return ref && typeof ref === 'object' ? ref : ref ? { sourceUrl: ref } : null;
  }).filter(Boolean);
  const sourceHiddenRefs = location?.overviewHiddenImages?.length
    ? location.overviewHiddenImages
    : (location?.overviewHiddenImageRefs || []);
  next.overviewHiddenImageRefs = sourceHiddenRefs.map((photo) => stablePhotoRef(photo)).filter(Boolean);
  next.landscapeImageAssetIds = (location?.landscapeImageAssetIds?.length
    ? location.landscapeImageAssetIds
    : next.landscapeImageRefs.map(photoIdOf)).filter(Boolean);
  return next;
}

function photoMetadata(photo) {
  const metadata = stablePhotoRef(photo) || {};
  delete metadata.storagePath;
  delete metadata.storage_path;
  delete metadata.hasBlob;
  return metadata;
}

function extensionForPhoto(photo, blob) {
  const name = String(photo?.fileName || photo?.name || 'photo.jpg');
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension && /^[a-z0-9]{2,5}$/.test(extension)) return extension;
  const type = blob?.type || photo?.fileType || photo?.type || 'image/jpeg';
  return type.split('/')[1] || 'jpg';
}

function dataUrlToBlob(value) {
  if (typeof value !== 'string' || !value.startsWith('data:')) return null;
  const [header, body] = value.split(',', 2);
  if (!header || body === undefined) return null;
  const mime = header.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream';
  const binary = atob(body);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

async function getUploadBlob(photo) {
  if (isBlob(photo?.blob) && photo.blob.size > 0) return photo.blob;
  const dataBlob = dataUrlToBlob(photo?.url || photo?.src || '');
  if (dataBlob) return dataBlob;
  const runtimeUrl = photo?.url || photo?.src || '';
  if (isEphemeralUrl(runtimeUrl)) {
    const response = await fetch(runtimeUrl);
    if (response.ok) return response.blob();
  }
  return null;
}

function ensureConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase 未配置，请先设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY');
  }
}

async function savePhotoRow({ photo, ownerId, tripId = '', locationId = '' }) {
  ensureConfigured();
  const id = photoIdOf(photo);
  if (!id) return null;
  const blob = await getUploadBlob(photo);
  let storagePath = photo?.storagePath || photo?.storage_path || '';
  if (!storagePath && !blob) {
    const { data: existing, error: readError } = await supabase
      .from('photos')
      .select('storage_path')
      .eq('id', id)
      .maybeSingle();
    if (readError) throw new Error(`照片记录读取失败：${readError.message}`);
    storagePath = existing?.storage_path || '';
  }
  if (blob) {
    storagePath = storagePath || `${ownerId}/${tripId || locationId || 'shared'}/${id}.${extensionForPhoto(photo, blob)}`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(storagePath, blob, {
      upsert: true,
      contentType: blob.type || photo?.fileType || 'image/jpeg',
      cacheControl: '31536000',
    });
    if (error) throw new Error(`照片上传失败：${error.message}`);
  }
  const row = {
    id,
    owner_id: ownerId,
    trip_id: tripId || null,
    storage_path: storagePath || null,
    metadata: photoMetadata(photo),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('photos').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`照片记录保存失败：${error.message}`);
  return row;
}

async function saveTripRow({ trip, locationId, ownerId }) {
  if (!trip?.id) return;
  const row = {
    id: trip.id,
    owner_id: ownerId,
    location_id: locationId || trip.locationId || null,
    data: stableTrip(trip),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('trips').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`旅程保存失败：${error.message}`);
}

async function saveLocationRow({ location, ownerId }) {
  if (!location?.id) return;
  const row = {
    id: location.id,
    owner_id: ownerId,
    city_id: location.cityId || location.city_id || location.id,
    data: {
      ...stableLocation(location),
      tripIds: (location.trips || []).map((trip) => trip.id).filter(Boolean),
    },
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('locations').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`地点保存失败：${error.message}`);
}

async function saveSettingRow({ key, value, ownerId }) {
  if (!key) return;
  const { error } = await supabase.from('settings').upsert({
    key,
    owner_id: ownerId,
    data: cloneJson(value),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
  if (error) throw new Error(`设置保存失败：${error.message}`);
}

async function deletePhotoRow(photoId, ownerId) {
  if (!photoId) return;
  const { data: row, error: readError } = await supabase
    .from('photos')
    .select('storage_path')
    .eq('id', photoId)
    .maybeSingle();
  if (readError) throw new Error(`照片删除前读取失败：${readError.message}`);
  const { error } = await supabase.from('photos').delete().eq('id', photoId).eq('owner_id', ownerId);
  if (error) throw new Error(`照片记录删除失败：${error.message}`);
  if (row?.storage_path) {
    const { error: storageError } = await supabase.storage.from(PHOTO_BUCKET).remove([row.storage_path]);
    if (storageError) throw new Error(`照片文件删除失败：${storageError.message}`);
  }
}

async function deleteRow(table, id, ownerId) {
  if (!id) return;
  const { error } = await supabase.from(table).delete().eq('id', id).eq('owner_id', ownerId);
  if (error) throw new Error(`${table} 删除失败：${error.message}`);
}

export async function persistSupabaseOperations(operations = []) {
  try {
    ensureConfigured();
    if (!operations.length) return true;
    const owner = await getSupabaseUser();
    if (import.meta.env.DEV) {
      console.info('[SupabasePersistence] auth', JSON.stringify({
        userId: owner.id,
        anonymous: owner.is_anonymous === true,
      }));
    }
    const photoOps = operations.filter((operation) => operation.type === 'photo-asset' || operation.type === 'photo-meta');
    const entityOps = operations.filter((operation) => ['trip-put', 'location-put', 'setting-put'].includes(operation.type));
    const deleteOps = operations.filter((operation) => operation.type.endsWith('-delete'));

    for (const operation of photoOps) {
      await savePhotoRow({
        photo: operation.photo,
        ownerId: owner.id,
        tripId: operation.tripId,
        locationId: operation.locationId,
      });
    }
    for (const operation of entityOps) {
      if (operation.type === 'trip-put') await saveTripRow({ trip: operation.trip, locationId: operation.locationId, ownerId: owner.id });
      if (operation.type === 'location-put') await saveLocationRow({ location: operation.location, ownerId: owner.id });
      if (operation.type === 'setting-put') await saveSettingRow({ key: operation.key, value: operation.value, ownerId: owner.id });
    }
    for (const operation of deleteOps) {
      if (operation.type === 'photo-delete') await deletePhotoRow(operation.photoId, owner.id);
      if (operation.type === 'trip-delete') await deleteRow('trips', operation.tripId, owner.id);
      if (operation.type === 'location-delete') await deleteRow('locations', operation.locationId, owner.id);
    }
    return true;
  } catch (error) {
    reportSupabaseError('persist', error);
    throw error;
  }
}

export async function persistSupabasePhotoMutation({
  photo = null,
  trip = null,
  location = null,
  locationId = '',
  tripId = '',
  deletePhotoIds = [],
  action = 'persistSupabasePhotoMutation',
} = {}) {
  const operations = [];
  if (photo) operations.push({ type: photo.blob || photo.url ? 'photo-asset' : 'photo-meta', action, photo, locationId, tripId });
  if (trip) operations.push({ type: 'trip-put', action, trip, locationId });
  if (location) operations.push({ type: 'location-put', action, location });
  [...new Set(deletePhotoIds.filter(Boolean))].forEach((photoId) => operations.push({ type: 'photo-delete', action, photoId }));
  await persistSupabaseOperations(operations);
  return true;
}

export async function getPhotoUrl(storagePath) {
  ensureConfigured();
  if (!storagePath) return '';
  const cached = signedUrlCache.get(storagePath);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(`照片地址读取失败：${error.message}`);
  signedUrlCache.set(storagePath, { url: data.signedUrl, expiresAt: Date.now() + (SIGNED_URL_TTL_SECONDS - 60) * 1000 });
  return data.signedUrl;
}

export async function loadSupabaseTravelState() {
  ensureConfigured();
  await getSupabaseUser();
  const [locationsResult, tripsResult, photosResult, settingsResult] = await Promise.all([
    supabase.from('locations').select('id,city_id,data,updated_at').order('updated_at', { ascending: true }),
    supabase.from('trips').select('id,location_id,data,updated_at').order('updated_at', { ascending: true }),
    supabase.from('photos').select('id,trip_id,storage_path,metadata,updated_at').order('updated_at', { ascending: true }),
    supabase.from('settings').select('key,data,updated_at'),
  ]);
  const firstError = [locationsResult, tripsResult, photosResult, settingsResult].find((result) => result.error)?.error;
  if (firstError) throw new Error(`Supabase 数据读取失败：${firstError.message}`);

  const photoMap = new Map((photosResult.data || []).map((row) => [row.id, cloudPhotoFromRow(row)]));
  const tripRows = tripsResult.data || [];
  const tripMap = new Map(tripRows.map((row) => {
    const data = cloneJson(row.data) || {};
    const photoRefs = Array.isArray(data.photos) && data.photos.length ? data.photos : (data.photoIds || data.photos);
    const hydrated = hydrateCloudTripPhotos(
      photoReferenceList(photoRefs, 'Trip photos'), data.days, photoMap,
    );
    const trip = {
      ...data,
      id: row.id,
      locationId: row.location_id || data.locationId,
      photos: hydrated.photos,
      days: hydrated.days,
      photosMigrated: true,
    };
    const coverRef = data.coverPhoto || data.coverPhotoRef;
    if (coverRef) trip.coverPhoto = hydrateCloudPhoto(coverRef, photoMap);
    delete trip.photoIds;
    delete trip.coverPhotoRef;
    return [row.id, trip];
  }));
  const locations = (locationsResult.data || []).map((row) => {
    const data = cloneJson(row.data) || {};
    const tripIds = data.tripIds || [];
    const landscapeRefs = data.landscapeImageRefs || [];
    const location = {
      ...data,
      id: row.id,
      cityId: row.city_id || data.cityId || row.id,
      trips: tripIds.map((id) => tripMap.get(id)).filter(Boolean),
      landscapeImages: landscapeRefs.map((ref) => hydrateCloudPhoto(ref, photoMap)).filter(Boolean),
      overviewHiddenImages: (data.overviewHiddenImageRefs || []).map((ref) => hydrateCloudPhoto(ref, photoMap)).filter(Boolean),
      landscapeImageAssetIds: landscapeRefs.map(photoIdOf).filter(Boolean),
    };
    delete location.tripIds;
    delete location.landscapeImageRefs;
    delete location.overviewHiddenImageRefs;
    return location;
  });
  const stateMeta = settingsResult.data?.find((row) => row.key === 'stateMeta')?.data || null;
  return {
    locations,
    stateMeta,
    source: 'supabase',
    status: 'ready',
    empty: locations.length === 0 && tripRows.length === 0,
  };
}

function migratedTripData(record) {
  const data = cloneJson(record) || {};
  delete data.owner_id;
  delete data.updated_at;
  delete data.locationId;
  return data;
}

export async function migrateIndexedDbToSupabase() {
  ensureConfigured();
  const owner = await getSupabaseUser();
  const snapshot = await readStoredTravelSnapshot();
  const metadataById = new Map((snapshot.photoMetadata || []).map((record) => [record.id, record]));
  const photos = snapshot.photos || [];
  const skippedPhotos = [];
  let photosUploaded = 0;

  for (const record of photos) {
    const metadata = metadataById.get(record.id) || {};
    const photo = { ...metadata, ...record, id: record.id, assetId: record.id };
    if (!isBlob(record.blob) || record.blob.size <= 0) {
      skippedPhotos.push(record.id);
      continue;
    }
    await savePhotoRow({
      photo,
      ownerId: owner.id,
      tripId: record.tripId || metadata.tripId || '',
      locationId: record.locationId || metadata.locationId || '',
    });
    photosUploaded += 1;
  }

  for (const record of snapshot.trips || []) {
    await saveTripRow({ trip: migratedTripData(record), locationId: record.locationId, ownerId: owner.id });
  }
  for (const record of snapshot.locations || []) {
    await saveLocationRow({ location: { ...migratedTripData(record), trips: (record.tripIds || []).map((id) => ({ id })) }, ownerId: owner.id });
  }
  for (const record of snapshot.settings || []) {
    await saveSettingRow({ key: record.key, value: record.value ?? record.data, ownerId: owner.id });
  }
  return {
    locations: (snapshot.locations || []).length,
    trips: (snapshot.trips || []).length,
    photosUploaded,
    photosSkipped: skippedPhotos,
  };
}
