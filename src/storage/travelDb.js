const DB_NAME = 'travel-memory-db';
const DB_VERSION = 2;
const STORE_NAMES = ['locations', 'trips', 'photos', 'photoMetadata', 'settings'];

const runtimeUrls = new Map();
const blobCache = new Map();
const runtimeUrlReferences = new Map();
const photoMetadataCache = new Map();
const pendingPhotoLoads = new Map();
const assetGenerations = new Map();
const photoLoadWarnings = new Set();
const photoStorageStats = { blobReads: 0, cacheHits: 0, cacheMisses: 0, objectUrlsCreated: 0 };
const malformedPhotoReferenceWarnings = new Set();
const MAX_RUNTIME_OBJECT_URLS = 96;
let writeQueue = Promise.resolve();

const DEBUG_PHOTO_STORAGE = import.meta.env.DEV && import.meta.env.VITE_DEBUG_PHOTO_STORAGE === 'true';
const DEBUG_STORAGE_WRITES = import.meta.env.DEV && import.meta.env.VITE_DEBUG_STORAGE_WRITES === 'true';

function logPhotoStorage(event, details = {}) {
  if (!DEBUG_PHOTO_STORAGE) return;
  console.info('[PhotoStoragePerf] ' + JSON.stringify({ event, ...details }));
}

function logTravelDbWrite(details) {
  if (!DEBUG_STORAGE_WRITES) return;
  console.info('[TravelDbWrite] ' + JSON.stringify(details));
}

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function isBlob(value) {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isAssetUrl(value) {
  return typeof value === 'string' && (value.startsWith('blob:') || value.startsWith('data:'));
}

function normalizePhotoAssetIds(value, source = 'photo references') {
  if (value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (typeof value === 'number' && Number.isFinite(value)) return [String(value)];

  let values;
  if (Array.isArray(value)) values = value;
  else if (value instanceof Set) values = [...value];
  else if (typeof value === 'object') {
    const id = value.assetId ?? value.photoId ?? value.id;
    if (typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id))) {
      return normalizePhotoAssetIds(id, source);
    }
    if (value.assetIds != null) return normalizePhotoAssetIds(value.assetIds, source);
    warnMalformedPhotoReference(value, source);
    return [];
  } else {
    warnMalformedPhotoReference(value, source);
    return [];
  }

  return values.flatMap((item) => normalizePhotoAssetIds(item, source));
}

function warnMalformedPhotoReference(value, source) {
  if (!import.meta.env.DEV) return;
  const type = value === null ? 'null' : typeof value;
  const warningKey = `${source}:${type}`;
  if (malformedPhotoReferenceWarnings.has(warningKey)) return;
  malformedPhotoReferenceWarnings.add(warningKey);
  console.warn(`[PhotoPersistenceHydration] skipped malformed ${source} (${type})`);
}

function photoMetadataRecord(record) {
  const metadata = cloneValue(record || {});
  delete metadata.blob;
  delete metadata.previewSource;
  return {
    ...metadata,
    id: record?.id,
    hasBlob: Boolean(record?.blob || record?.hasBlob),
  };
}

function openDatabase() {
  if (!hasIndexedDb()) return Promise.reject(new Error('当前浏览器不支持 IndexedDB'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains('locations')) db.createObjectStore('locations', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('trips')) {
        const store = db.createObjectStore('trips', { keyPath: 'id' });
        store.createIndex('locationId', 'locationId', { unique: false });
      }
      if (!db.objectStoreNames.contains('photos')) {
        const store = db.createObjectStore('photos', { keyPath: 'id' });
        store.createIndex('locationId', 'locationId', { unique: false });
        store.createIndex('tripId', 'tripId', { unique: false });
      }
      if (!db.objectStoreNames.contains('photoMetadata')) {
        db.createObjectStore('photoMetadata', { keyPath: 'id' });
      }
      if (event?.oldVersion < 2) {
        const sourceStore = request.transaction.objectStore('photos');
        const metadataStore = request.transaction.objectStore('photoMetadata');
        const cursorRequest = sourceStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          metadataStore.put(photoMetadataRecord(cursor.value));
          cursor.continue();
        };
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 打开失败'));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 请求失败'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB 事务失败'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB 事务已中止'));
  });
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object' || value instanceof Date || isBlob(value)) return value;
  const result = {};
  Object.entries(value).forEach(([key, item]) => {
    if (item !== undefined) result[key] = cloneValue(item);
  });
  return result;
}

function getRuntimeUrl(assetId, blob) {
  if (!blob) return '';
  if (!runtimeUrls.has(assetId)) {
    runtimeUrls.set(assetId, URL.createObjectURL(blob));
    photoStorageStats.objectUrlsCreated += 1;
  } else {
    const existingUrl = runtimeUrls.get(assetId);
    runtimeUrls.delete(assetId);
    runtimeUrls.set(assetId, existingUrl);
  }
  blobCache.set(assetId, blob);
  pruneRuntimeUrls(assetId);
  return runtimeUrls.get(assetId);
}

function pruneRuntimeUrls(protectedAssetId = '') {
  if (runtimeUrls.size <= MAX_RUNTIME_OBJECT_URLS) return;
  for (const assetId of runtimeUrls.keys()) {
    if (runtimeUrls.size <= MAX_RUNTIME_OBJECT_URLS) break;
    if (assetId === protectedAssetId || (runtimeUrlReferences.get(assetId) || 0) > 0) continue;
    const url = runtimeUrls.get(assetId);
    if (url) URL.revokeObjectURL(url);
    runtimeUrls.delete(assetId);
    blobCache.delete(assetId);
  }
}

export function getRuntimeAssetUrl(assetId, blob) {
  return getRuntimeUrl(assetId, blob);
}

export function retainRuntimeAsset(assetId) {
  if (!assetId || !runtimeUrls.has(assetId)) return false;
  runtimeUrlReferences.set(assetId, (runtimeUrlReferences.get(assetId) || 0) + 1);
  const url = runtimeUrls.get(assetId);
  runtimeUrls.delete(assetId);
  runtimeUrls.set(assetId, url);
  return true;
}

export function releaseRuntimeAssetReference(assetId) {
  if (!assetId) return;
  const references = runtimeUrlReferences.get(assetId) || 0;
  if (references <= 1) runtimeUrlReferences.delete(assetId);
  else runtimeUrlReferences.set(assetId, references - 1);
  pruneRuntimeUrls();
}

export function releaseRuntimeAsset(assetId) {
  assetGenerations.set(assetId, (assetGenerations.get(assetId) || 0) + 1);
  const url = runtimeUrls.get(assetId);
  if (url) URL.revokeObjectURL(url);
  runtimeUrls.delete(assetId);
  blobCache.delete(assetId);
  runtimeUrlReferences.delete(assetId);
  photoLoadWarnings.delete(assetId);
}

export function releaseRuntimeAssets(assetIds) {
  (assetIds || []).forEach((assetId) => {
    if (assetId) releaseRuntimeAsset(assetId);
  });
}

export function getCachedPhotoObjectUrl(assetId) {
  return assetId ? runtimeUrls.get(assetId) || '' : '';
}

function collectReferencedPhotoIds(locationRecords, tripRecords) {
  const ids = new Set();
  const add = (value) => {
    normalizePhotoAssetIds(value).forEach((id) => ids.add(id));
  };

  (Array.isArray(locationRecords) ? locationRecords : []).forEach((location) => {
    (Array.isArray(location?.landscapeImageRefs) ? location.landscapeImageRefs : []).forEach((ref) => add(ref));
    (Array.isArray(location?.overviewHiddenImageRefs) ? location.overviewHiddenImageRefs : []).forEach((ref) => add(ref));
  });
  (Array.isArray(tripRecords) ? tripRecords : []).forEach((trip) => {
    add(trip.coverPhotoRef);
    add(trip.photoIds);
    (Array.isArray(trip.days) ? trip.days : []).forEach((day) => (Array.isArray(day?.blocks) ? day.blocks : []).forEach((block) => {
      if (block?.type === 'photos') add(block.photoIds);
      if (block.type !== 'itinerary') return;
      const mealPhotoIds = block.mealPhotoIds && typeof block.mealPhotoIds === 'object'
        ? Object.values(block.mealPhotoIds)
        : [];
      mealPhotoIds.forEach(add);
    }));
  });
  return ids;
}

async function readPhotoRecordsByIds(assetIds) {
  const ids = [...new Set(normalizePhotoAssetIds(assetIds, 'assetIds'))];
  if (!ids.length) return [];
  const db = await openDatabase();
  try {
    const transaction = db.transaction('photos', 'readonly');
    const transactionComplete = transactionDone(transaction);
    const store = transaction.objectStore('photos');
    const requests = ids.map((id) => requestValue(store.get(id)));
    const records = await Promise.all(requests);
    await transactionComplete;
    const existing = records.filter(Boolean);
    photoStorageStats.blobReads += existing.length;
    return existing;
  } finally {
    db.close();
  }
}

async function repairPhotoMetadata(records) {
  if (!records.length) return;
  const db = await openDatabase();
  try {
    const transaction = db.transaction('photoMetadata', 'readwrite');
    const store = transaction.objectStore('photoMetadata');
    records.forEach((record) => store.put(photoMetadataRecord(record)));
    await transactionDone(transaction);
    records.forEach((record) => photoMetadataCache.set(record.id, photoMetadataRecord(record)));
  } finally {
    db.close();
  }
}

async function getPhotoRecord(assetId) {
  if (!assetId) return null;
  const db = await openDatabase();
  try {
    const transaction = db.transaction('photos', 'readonly');
    const transactionComplete = transactionDone(transaction);
    const record = await requestValue(transaction.objectStore('photos').get(assetId));
    await transactionComplete;
    photoStorageStats.blobReads += 1;
    return record || null;
  } finally {
    db.close();
  }
}

export async function getPhotoMetadata(assetId) {
  if (!assetId) return null;
  if (photoMetadataCache.has(assetId)) return photoMetadataCache.get(assetId);
  const db = await openDatabase();
  try {
    const transaction = db.transaction('photoMetadata', 'readonly');
    const transactionComplete = transactionDone(transaction);
    const record = await requestValue(transaction.objectStore('photoMetadata').get(assetId));
    await transactionComplete;
    if (record) photoMetadataCache.set(assetId, record);
    return record || null;
  } finally {
    db.close();
  }
}

async function readPhotoPersistenceAudit({ photoId = '', locationId = '', tripId = '', deletedPhotoIds = [] } = {}) {
  const stores = new Set(['photos', 'photoMetadata']);
  if (locationId) stores.add('locations');
  if (tripId) stores.add('trips');
  const db = await openDatabase();
  try {
    const transaction = db.transaction([...stores], 'readonly');
    const transactionComplete = transactionDone(transaction);
    const photoRequest = photoId ? requestValue(transaction.objectStore('photos').get(photoId)) : Promise.resolve(null);
    const metadataRequest = photoId ? requestValue(transaction.objectStore('photoMetadata').get(photoId)) : Promise.resolve(null);
    const locationRequest = locationId ? requestValue(transaction.objectStore('locations').get(locationId)) : Promise.resolve(null);
    const tripRequest = tripId ? requestValue(transaction.objectStore('trips').get(tripId)) : Promise.resolve(null);
    const deletedRequests = deletedPhotoIds.map((id) => requestValue(transaction.objectStore('photos').get(id)));
    const [photoRecord, metadataRecord, locationRecord, tripRecord, ...deletedRecords] = await Promise.all([
      photoRequest,
      metadataRequest,
      locationRequest,
      tripRequest,
      ...deletedRequests,
    ]);
    await transactionComplete;

    const parentReference = tripId
      ? Boolean(tripRecord
        && (!locationId || (locationRecord && Array.isArray(locationRecord.tripIds) && locationRecord.tripIds.includes(tripId)))
        && (
          tripRecord.coverPhotoRef === photoId
          || (Array.isArray(tripRecord.photoIds) && tripRecord.photoIds.includes(photoId))
        ))
      : locationId
        ? Boolean(locationRecord && (
          (locationRecord.landscapeImageRefs || []).some((ref) => ref?.assetId === photoId)
          || (locationRecord.overviewHiddenImageRefs || []).some((ref) => ref?.assetId === photoId)
        ))
        : true;

    return {
      photoPresent: Boolean(photoRecord),
      metadataPresent: Boolean(metadataRecord),
      hasBlob: isBlob(photoRecord?.blob) && photoRecord.blob.size > 0,
      blobSize: isBlob(photoRecord?.blob) ? photoRecord.blob.size : 0,
      parentPresent: tripId
        ? Boolean(tripRecord && (!locationId || locationRecord))
        : locationId ? Boolean(locationRecord) : true,
      parentReference,
      deletedPhotoIdsMissing: deletedRecords.every((record) => !record),
    };
  } finally {
    db.close();
  }
}

export async function persistPhotoMutation({
  photo = null,
  trip = null,
  location = null,
  locationId = '',
  tripId = '',
  deletePhotoIds = [],
  action = 'persistPhotoMutation',
} = {}) {
  const photoId = photo?.assetId || photo?.id || '';
  const resolvedTripId = tripId || trip?.id || '';
  const resolvedLocationId = locationId || location?.id || '';
  const operations = [];
  if (location) operations.push({ type: 'location-put', action, location });
  if (trip) operations.push({ type: 'trip-put', action, trip, locationId: resolvedLocationId });
  if (photoId) {
    const hasRuntimeSource = isAssetUrl(photo?.url);
    operations.push({
      type: photo?.blob || hasRuntimeSource ? 'photo-asset' : 'photo-meta',
      action,
      photo,
      locationId: resolvedLocationId,
      tripId: resolvedTripId,
      photoId,
    });
  }
  [...new Set(deletePhotoIds.filter(Boolean))].forEach((id) => {
    if (id === photoId) return;
    operations.push({ type: 'photo-delete', action, photoId: id });
  });
  if (!operations.length) return { photoPresent: false, metadataPresent: false, hasBlob: false };

  await persistIncrementalWrites(operations);
  const audit = await readPhotoPersistenceAudit({
    photoId,
    locationId: resolvedLocationId,
    tripId: resolvedTripId,
    deletedPhotoIds: deletePhotoIds,
  });
  const expectsBlob = Boolean(photoId && (photo?.blob || isAssetUrl(photo?.url)));
  const uploadValid = !photoId || (
    audit.photoPresent
    && audit.metadataPresent
    && audit.parentPresent
    && audit.parentReference
    && (!expectsBlob || audit.hasBlob)
  );
  if (!uploadValid) {
    const details = {
      action,
      photoId,
      locationId: resolvedLocationId || null,
      tripId: resolvedTripId || null,
      photoPresent: audit.photoPresent,
      metadataPresent: audit.metadataPresent,
      hasBlob: audit.hasBlob,
      parentReference: audit.parentReference,
    };
    if (import.meta.env.DEV) {
      console.error('[PhotoPersistence] blob verification failed', JSON.stringify(details));
    }
    throw new Error('照片资源未完成持久化校验');
  }
  if (!audit.deletedPhotoIdsMissing) {
    const details = { action, deletePhotoIds: [...new Set(deletePhotoIds.filter(Boolean))] };
    if (import.meta.env.DEV) {
      console.error('[PhotoPersistence] delete verification failed', JSON.stringify(details));
    }
    throw new Error('旧照片资源未完成删除校验');
  }
  if (import.meta.env.DEV && (DEBUG_PHOTO_STORAGE || DEBUG_STORAGE_WRITES)) {
    console.info('[PhotoPersistenceAudit] ' + JSON.stringify({
      action,
      photoId: photoId || null,
      locationId: resolvedLocationId || null,
      tripId: resolvedTripId || null,
      photoStore: audit.photoPresent,
      metadataStore: audit.metadataPresent,
      hasBlob: audit.hasBlob,
      blobSize: audit.blobSize,
      parentReference: audit.parentReference,
      deletedPhotoIdsMissing: audit.deletedPhotoIdsMissing,
    }));
  }
  return audit;
}

export async function getPhotoObjectUrl(assetId, fallbackUrl = '') {
  if (!assetId) return fallbackUrl || '';
  // A blob/data URL is scoped to the previous page session. Never let it
  // short-circuit the IndexedDB lookup after a refresh.
  if (fallbackUrl && !isAssetUrl(fallbackUrl)) return fallbackUrl;
  const cachedUrl = getCachedPhotoObjectUrl(assetId);
  if (cachedUrl) {
    photoStorageStats.cacheHits += 1;
    logPhotoStorage('cache-hit', { assetId, blobReads: photoStorageStats.blobReads, cacheHits: photoStorageStats.cacheHits, cacheMisses: photoStorageStats.cacheMisses });
    return cachedUrl;
  }
  const pending = pendingPhotoLoads.get(assetId);
  if (pending) return pending;

  photoStorageStats.cacheMisses += 1;
  const generation = assetGenerations.get(assetId) || 0;
  const promise = getPhotoRecord(assetId).then((record) => {
    if (!record) {
      if (import.meta.env.DEV && !photoLoadWarnings.has(assetId)) {
        console.warn('[PhotoLoad]', { photoId: assetId, reason: 'photo-record-missing' });
        photoLoadWarnings.add(assetId);
      }
      return '';
    }
    if (assetGenerations.get(assetId) !== generation) return '';
    if (isBlob(record.blob) && record.blob.size > 0) return getRuntimeUrl(assetId, record.blob);
    if (record.sourceUrl) return record.sourceUrl;
    if (import.meta.env.DEV && !photoLoadWarnings.has(assetId)) {
      console.warn('[PhotoLoad]', { photoId: assetId, reason: 'photo-blob-missing' });
      photoLoadWarnings.add(assetId);
    }
    return '';
  }).catch((error) => {
    if (import.meta.env.DEV && !photoLoadWarnings.has(assetId)) {
      console.warn('[PhotoLoad]', { photoId: assetId, reason: 'photo-read-failed', error: error?.message || 'unknown' });
      photoLoadWarnings.add(assetId);
    }
    return '';
  }).finally(() => {
    if (pendingPhotoLoads.get(assetId) === promise) pendingPhotoLoads.delete(assetId);
  });
  pendingPhotoLoads.set(assetId, promise);
  logPhotoStorage('blob-read-start', { assetId, blobReads: photoStorageStats.blobReads, cacheHits: photoStorageStats.cacheHits, cacheMisses: photoStorageStats.cacheMisses });
  return promise;
}

function createAssetRegistrar() {
  const assets = new Map();

  const register = (raw, fallbackId, fields = {}) => {
    const source = raw && typeof raw === 'object' ? raw : { url: raw };
    const url = source.url || source.src || '';
    const blob = source.blob || null;
    const requestedId = source.assetId || source.id || fallbackId;
    if (!url && !blob && !requestedId) return null;
    const id = requestedId || `asset-${assets.size + 1}`;
    const assetId = id;
    const current = assets.get(assetId) || {};
    const metadata = cloneValue(source);
    delete metadata.url;
    delete metadata.src;
    delete metadata.blob;
    delete metadata.assetId;
    assets.set(assetId, {
      ...current,
      id: assetId,
      blob: blob || current.blob || null,
      hasBlob: Boolean(blob || current.hasBlob),
      previewSource: isAssetUrl(url) ? (url || current.previewSource || null) : null,
      sourceUrl: isAssetUrl(url) ? (source.sourceUrl || current.sourceUrl || null) : (url || source.sourceUrl || current.sourceUrl || null),
      ...metadata,
      ...fields,
    });
    return assetId;
  };

  return { assets, register };
}

async function urlToBlob(url) {
  if (!url || !isAssetUrl(url)) return null;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`图片资源读取失败 (${response.status})`);
  return response.blob();
}

async function materializeAsset(asset) {
  const cached = blobCache.get(asset.id);
  let blob = cached || asset.blob || null;
  if (!blob && asset.previewSource) blob = await urlToBlob(asset.previewSource);
  if (blob) {
    blobCache.set(asset.id, blob);
    const record = cloneValue(asset);
    delete record.previewSource;
    return { ...record, id: asset.id, blob, sourceUrl: null };
  }
  const record = cloneValue(asset);
  delete record.previewSource;
  return { ...record, id: asset.id, blob: null, sourceUrl: asset.sourceUrl || null };
}

function runtimePhoto(record, { createObjectUrl = false } = {}) {
  const metadata = { ...record };
  delete metadata.blob;
  const hasUsableBlob = isBlob(record.blob) && record.blob.size > 0;
  const url = createObjectUrl && hasUsableBlob
    ? getRuntimeUrl(record.id, record.blob)
    : record.sourceUrl || (record.url && !isAssetUrl(record.url) ? record.url : '');
  // Metadata rows intentionally do not contain the binary. Do not turn a
  // missing binary into an empty photo that masks a later asset-id retry.
  if (!hasUsableBlob && !url) return null;
  const next = { ...metadata, assetId: record.id, url, hasBlob: Boolean(record.hasBlob) };
  photoMetadataCache.set(record.id, next);
  return next;
}

function hydrateDays(days, photoMap) {
  const photoForId = (reference) => {
    const id = normalizePhotoAssetIds(reference, 'photo reference')[0];
    return id ? photoMap.get(id) || { id, assetId: id, url: '' } : null;
  };
  return (Array.isArray(days) ? days : []).map((day) => ({
    ...day,
    blocks: (Array.isArray(day?.blocks) ? day.blocks : []).map((block) => {
      if (block?.type === 'photos' && block.photoIds != null) {
        const photos = normalizePhotoAssetIds(block.photoIds, 'Day photoIds').map(photoForId).filter(Boolean);
        return { ...block, data: { ...block.data, photos } };
      }
      if (block?.type !== 'itinerary' || !block.data?.mealPhotoIds || typeof block.data.mealPhotoIds !== 'object') return block;
      const slots = (block.data.slots || []).map((slot, slotIndex) => {
        const next = { ...slot };
        ['breakfast', 'lunch', 'dinner'].forEach((mealType) => {
          const id = block.data.mealPhotoIds[slotIndex + ':' + mealType];
          if (id) next[mealType] = photoForId(id);
        });
        return next;
      });
      return { ...block, data: { ...block.data, slots } };
    }),
  }));
}

export async function loadTravelState() {
  photoStorageStats.blobReads = 0;
  photoStorageStats.cacheHits = 0;
  photoStorageStats.cacheMisses = 0;
  photoStorageStats.objectUrlsCreated = 0;
  const db = await openDatabase();
  let locationRecords;
  let tripRecords;
  let photoMetadataRecords;
  let stateMeta;
  try {
    const transaction = db.transaction(STORE_NAMES, 'readonly');
    const transactionComplete = transactionDone(transaction);
    const locationsRequest = transaction.objectStore('locations').getAll();
    const tripsRequest = transaction.objectStore('trips').getAll();
    const photoMetadataRequest = transaction.objectStore('photoMetadata').getAll();
    const settingsRequest = transaction.objectStore('settings').get('stateMeta');
    [locationRecords, tripRecords, photoMetadataRecords, stateMeta] = await Promise.all([
      requestValue(locationsRequest),
      requestValue(tripsRequest),
      requestValue(photoMetadataRequest),
      requestValue(settingsRequest),
    ]);
    await transactionComplete;
  } finally {
    db.close();
  }
  if (!stateMeta && !locationRecords.length && !tripRecords.length && !photoMetadataRecords.length) return null;

  const safePhotoMetadataRecords = Array.isArray(photoMetadataRecords) ? photoMetadataRecords : [];
  const safeLocationRecords = Array.isArray(locationRecords) ? locationRecords : [];
  const safeTripRecords = Array.isArray(tripRecords) ? tripRecords : [];
  const photoMap = new Map();
  safePhotoMetadataRecords.forEach((record) => {
    try {
      if (!record || !record.id) throw new Error('missing photo metadata id');
      const photo = runtimePhoto(record);
      if (photo) photoMap.set(record.id, photo);
    } catch (error) {
      warnMalformedPhotoReference(error?.message || error, 'photo metadata');
    }
  });

  // Restore the referenced binary rows in one IndexedDB transaction. This
  // creates runtime URLs before React mounts the photo surfaces, so a refresh
  // never leaves the UI waiting on one database connection per frame.
  const referencedPhotoIds = collectReferencedPhotoIds(safeLocationRecords, safeTripRecords);
  const metadataById = new Map(safePhotoMetadataRecords.filter((record) => record?.id).map((record) => [record.id, record]));
  let restoredPhotoRecords = [];
  try {
    restoredPhotoRecords = await readPhotoRecordsByIds(referencedPhotoIds);
  } catch (error) {
    // Keep asset references in the returned state. Individual photo hooks can
    // retry by id; a transient photo-store failure must never cause a
    // fallback migration to overwrite the existing database.
    if (import.meta.env.DEV) {
      console.error('[PhotoPersistenceHydration] photo store read failed', error);
    }
  }
  // The binary row can predate later edits. Photo metadata is authoritative for
  // mutable fields (day, rotation, crop); the binary row only supplies the Blob.
  const hydratedPhotoRecords = restoredPhotoRecords.map((record) => {
    const metadata = metadataById.get(record?.id);
    if (!metadata) return record;
    return {
      ...record,
      ...metadata,
      id: record.id,
      blob: record.blob,
      sourceUrl: metadata.sourceUrl || record.sourceUrl || null,
      hasBlob: Boolean((isBlob(record.blob) && record.blob.size > 0) || metadata.hasBlob || record.hasBlob),
    };
  });
  hydratedPhotoRecords.forEach((record) => {
    try {
      if (!record || !record.id) throw new Error('missing photo asset id');
      const photo = runtimePhoto(record, { createObjectUrl: true });
      if (photo) photoMap.set(record.id, photo);
    } catch (error) {
      warnMalformedPhotoReference(error?.message || error, 'photo asset');
    }
  });
  const metadataRepairRecords = hydratedPhotoRecords.filter((record) => {
    const metadata = metadataById.get(record.id);
    return !metadata || (!metadata.hasBlob && !metadata.sourceUrl);
  });
  if (metadataRepairRecords.length) {
    try {
      await repairPhotoMetadata(metadataRepairRecords);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[PhotoPersistenceHydration] metadata repair failed', error?.message || 'unknown');
      }
    }
  }
  const photoForId = (reference) => {
    const id = normalizePhotoAssetIds(reference, 'photo reference')[0];
    return id ? photoMap.get(id) || { id, assetId: id, url: '' } : null;
  };
  const referencedMissing = [...referencedPhotoIds].filter((id) => !photoMap.has(id)).length;
  const tripMap = new Map(safeTripRecords.filter((record) => record?.id).map((record) => {
    const photos = normalizePhotoAssetIds(record.photoIds, 'Trip photoIds').map(photoForId).filter(Boolean);
    const trip = { ...record, photos, days: hydrateDays(record.days, photoMap) };
    if (record.coverPhotoRef) trip.coverPhoto = photoForId(record.coverPhotoRef);
    delete trip.photoIds;
    delete trip.coverPhotoRef;
    return [record.id, trip];
  }));

  const locations = safeLocationRecords.filter((record) => record?.id).map((record) => {
    const trips = normalizePhotoAssetIds(record.tripIds, 'Location tripIds').map((id) => tripMap.get(id)).filter(Boolean);
    const landscapeImages = (record.landscapeImageRefs || []).map((ref) => {
      if (ref?.assetId && photoMap.has(ref.assetId)) return photoMap.get(ref.assetId);
      if (ref?.assetId) return { id: ref.assetId, assetId: ref.assetId, url: '' };
      return ref?.url || '';
    }).filter(Boolean);
    const overviewHiddenImages = (record.overviewHiddenImageRefs || []).map((ref) => ({
      ...(ref?.assetId && photoMap.has(ref.assetId) ? photoMap.get(ref.assetId) : {}),
      url: ref?.assetId && photoMap.has(ref.assetId) ? photoMap.get(ref.assetId).url : ref?.url,
      assetId: ref?.assetId || undefined,
      sourceIndex: Number.isInteger(ref?.sourceIndex) ? ref.sourceIndex : null,
    })).filter((item) => item.url || item.assetId || item.id);
    const landscapeImageAssetIds = landscapeImages.map((photo) => (
      typeof photo === 'object' ? (photo.assetId || photo.id || '') : ''
    ));
    const location = { ...record, trips, landscapeImages, landscapeImageAssetIds, overviewHiddenImages };
    delete location.tripIds;
    delete location.landscapeImageRefs;
    delete location.overviewHiddenImageRefs;
    return location;
  });
  logPhotoStorage('startup', {
    photoMetadata: photoMetadataRecords.length,
    referencedPhotoIds: referencedPhotoIds.size,
    restoredFromPhotoStore: restoredPhotoRecords.length,
    metadataRepaired: metadataRepairRecords.length,
    referencedMissing,
    blobReads: photoStorageStats.blobReads,
    objectUrlsCreated: photoStorageStats.objectUrlsCreated,
  });
  if (import.meta.env.DEV && referencedMissing > 0) {
    console.warn('[PhotoPersistenceHydration] ' + JSON.stringify({
      referencedPhotoIds: referencedPhotoIds.size,
      metadataRecords: photoMetadataRecords.length,
      restoredFromPhotoStore: restoredPhotoRecords.length,
      metadataRepaired: metadataRepairRecords.length,
      referencedMissing,
    }));
  }
  return { locations, stateMeta };
}

// Read every local record for the one-time cloud migration. This is deliberately
// read-only and does not change the existing IndexedDB schema or local backup.
export async function readStoredTravelSnapshot() {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAMES, 'readonly');
    const transactionComplete = transactionDone(transaction);
    const requests = STORE_NAMES.map((storeName) => requestValue(
      transaction.objectStore(storeName).getAll(),
    ));
    const [locations, trips, photos, photoMetadata, settings] = await Promise.all(requests);
    await transactionComplete;
    return { locations, trips, photos, photoMetadata, settings };
  } finally {
    db.close();
  }
}

function sanitizeDay(day, register, tripId, locationId) {
  const blocks = (day.blocks || []).map((block) => {
    if (block.type === 'photos') {
      const photoIds = (block.data?.photos || []).map((photo, index) => register(
        photo,
        `photo-${tripId}-${day.id}-${index}`,
        { locationId, tripId, source: 'photo', dayId: day.id, sourceIndex: index },
      )).filter(Boolean);
      return { ...cloneValue(block), data: { ...cloneValue(block.data || {}), photos: [] }, photoIds };
    }
    if (block.type !== 'itinerary') return cloneValue(block);
    const mealPhotoIds = {};
    const slots = (block.data?.slots || []).map((slot, slotIndex) => {
      const next = { ...cloneValue(slot) };
      ['breakfast', 'lunch', 'dinner'].forEach((mealType) => {
        if (!slot?.[mealType]) return;
        const id = register(
          slot[mealType],
          `meal-${tripId}-${day.id}-${slotIndex}-${mealType}`,
          { locationId, tripId, source: 'meal', dayId: day.id, sourceIndex: slotIndex, mealType },
        );
        if (id) {
          mealPhotoIds[slotIndex + ':' + mealType] = id;
          next[mealType] = null;
        }
      });
      return next;
    });
    return { ...cloneValue(block), data: { ...cloneValue(block.data || {}), slots, mealPhotoIds } };
  });
  return { ...cloneValue(day), blocks };
}

function buildRecords(locations) {
  const registrar = createAssetRegistrar();
  const tripRecords = [];
  const locationRecords = [];

  (locations || []).forEach((location) => {
    const trips = Array.isArray(location.trips) ? location.trips : [];
    const tripIds = [];
    const landscapeImages = Array.isArray(location.landscapeImages) ? location.landscapeImages : [];
    const imageAssetIds = Array.isArray(location.landscapeImageAssetIds) ? location.landscapeImageAssetIds : [];
    const landscapeImageRefs = landscapeImages.map((url, index) => {
      const assetId = registrar.register(url, imageAssetIds[index] || `overview-${location.id}-${index}`, {
        locationId: location.id, scope: 'overview', sourceIndex: index,
      });
      return assetId ? { assetId } : { url };
    });
    const overviewHiddenImageRefs = (location.overviewHiddenImages || []).map((item) => {
      const entry = typeof item === 'string' ? { url: item, sourceIndex: null } : item || {};
      const sourceIndex = Number.isInteger(entry.sourceIndex) ? entry.sourceIndex : null;
      const index = sourceIndex === null ? -1 : sourceIndex;
      const assetId = registrar.register(entry, `overview-${location.id}-${index}`, {
        locationId: location.id, scope: 'overview', sourceIndex,
      });
      return assetId ? { assetId, sourceIndex } : { url: entry.url, sourceIndex };
    });

    trips.forEach((trip) => {
      const tripId = trip.id;
      tripIds.push(tripId);
      const photoIds = (Array.isArray(trip.photos) ? trip.photos : []).map((photo, index) => registrar.register(
        photo, `photo-${tripId}-${index}`, { locationId: location.id, tripId, scope: 'trip' },
      )).filter(Boolean);
      const coverSource = trip.coverPhoto || trip.coverPhotoUrl || trip.cover?.url;
      const coverPhotoRef = coverSource
        ? registrar.register(coverSource, `cover-${tripId}`, { locationId: location.id, tripId, scope: 'cover' })
        : null;
      const tripFields = { ...trip };
      delete tripFields.photos;
      delete tripFields.coverPhoto;
      delete tripFields.coverPhotoUrl;
      delete tripFields.cover;
      delete tripFields.days;
      const days = Array.isArray(trip.days) ? trip.days : [];
      tripRecords.push({
        ...cloneValue(tripFields), id: tripId, locationId: location.id, photoIds, coverPhotoRef,
        days: (days || []).map((day) => sanitizeDay(day, registrar.register, tripId, location.id)),
      });
    });

    const locationFields = { ...location };
    const landscapeImageMeta = locationFields.landscapeImageMeta;
    delete locationFields.trips;
    delete locationFields.landscapeImages;
    delete locationFields.landscapeImage;
    delete locationFields.landscapeImageMeta;
    delete locationFields.landscapeImageAssetIds;
    delete locationFields.overviewHiddenImages;
    locationRecords.push({
      ...cloneValue(locationFields), id: location.id, tripIds,
      landscapeImageMeta: cloneValue(landscapeImageMeta || []), landscapeImageRefs, overviewHiddenImageRefs,
    });
  });

  return { registrar, locationRecords, tripRecords };
}

function buildLocationRecord(location) {
  return buildRecords([location]).locationRecords[0] || null;
}

function buildTripRecord(trip, locationId) {
  if (!trip?.id) return null;
  const location = {
    id: locationId || trip.locationId || `location-${trip.id}`,
    trips: [{ ...trip, locationId: locationId || trip.locationId }],
    landscapeImages: [],
    landscapeImageMeta: [],
    landscapeImageAssetIds: [],
  };
  return buildRecords([location]).tripRecords[0] || null;
}

function buildPhotoAsset(photo, fields = {}) {
  const registrar = createAssetRegistrar();
  const id = registrar.register(photo, photo?.assetId || photo?.id, fields);
  if (!id) return null;
  return { id, asset: registrar.assets.get(id) };
}

function photoIdFromOperation(operation) {
  return operation.photoId || operation.photo?.assetId || operation.photo?.id || '';
}

async function buildIncrementalPlan(operations) {
  const puts = {
    locations: new Map(),
    trips: new Map(),
    photos: new Map(),
    photoMetadata: new Map(),
    settings: new Map(),
  };
  const deletes = {
    locations: new Set(),
    trips: new Set(),
    photos: new Set(),
    photoMetadata: new Set(),
    settings: new Set(),
  };
  const stores = new Set();
  const actions = new Set();

  for (const operation of operations || []) {
    if (!operation?.type) continue;
    actions.add(operation.action || operation.type);
    if (operation.type === 'location-put') {
      const record = buildLocationRecord(operation.location);
      if (record) { stores.add('locations'); puts.locations.set(record.id, record); }
    } else if (operation.type === 'location-delete') {
      stores.add('locations'); deletes.locations.add(operation.locationId);
    } else if (operation.type === 'trip-put') {
      const record = buildTripRecord(operation.trip, operation.locationId);
      if (record) { stores.add('trips'); puts.trips.set(record.id, record); }
    } else if (operation.type === 'trip-delete') {
      stores.add('trips'); deletes.trips.add(operation.tripId);
    } else if (operation.type === 'photo-meta') {
      const built = buildPhotoAsset(operation.photo, {
        locationId: operation.locationId,
        tripId: operation.tripId,
      });
      if (built) {
        stores.add('photoMetadata');
        puts.photoMetadata.set(built.id, photoMetadataRecord(built.asset));
      }
    } else if (operation.type === 'photo-asset') {
      const built = buildPhotoAsset(operation.photo, {
        locationId: operation.locationId,
        tripId: operation.tripId,
      });
      if (built) {
        const record = await materializeAsset(built.asset);
        stores.add('photos');
        stores.add('photoMetadata');
        puts.photos.set(record.id, record);
        puts.photoMetadata.set(record.id, photoMetadataRecord(record));
      }
    } else if (operation.type === 'photo-delete') {
      const id = photoIdFromOperation(operation);
      if (id) {
        stores.add('photos');
        stores.add('photoMetadata');
        deletes.photos.add(id);
        deletes.photoMetadata.add(id);
      }
    } else if (operation.type === 'setting-put') {
      if (operation.key) {
        stores.add('settings');
        puts.settings.set(operation.key, { key: operation.key, value: cloneValue(operation.value), updatedAt: Date.now() });
      }
    }
  }

  return { puts, deletes, stores: [...stores], actions: [...actions] };
}

async function writeIncrementalState(operations) {
  const plan = await buildIncrementalPlan(operations);
  if (!plan.stores.length) return;
  // Keep a durable marker on every successful incremental write. This lets
  // startup distinguish a real empty database from a partially migrated one.
  if (!plan.stores.includes('settings')) plan.stores.push('settings');
  plan.puts.settings.set('stateMeta', { key: 'stateMeta', schemaVersion: 2, updatedAt: Date.now() });
  const db = await openDatabase();
  try {
    const transaction = db.transaction(plan.stores, 'readwrite');
    plan.stores.forEach((storeName) => {
      const store = transaction.objectStore(storeName);
      plan.deletes[storeName].forEach((id) => store.delete(id));
      plan.puts[storeName].forEach((record) => store.put(record));
    });
    await transactionDone(transaction);
    plan.puts.photoMetadata.forEach((record, id) => {
      photoMetadataCache.set(id, record);
      if (record.hasBlob || record.sourceUrl) photoLoadWarnings.delete(id);
    });
    plan.deletes.photoMetadata.forEach((id) => photoMetadataCache.delete(id));
    logTravelDbWrite({
      action: plan.actions.join('+') || 'incremental',
      stores: plan.stores,
      recordsWritten: plan.stores.reduce((count, storeName) => count + plan.puts[storeName].size, 0),
      recordsDeleted: plan.stores.reduce((count, storeName) => count + plan.deletes[storeName].size, 0),
      operationCount: operations.length,
    });
  } finally {
    db.close();
  }
}

export function persistIncrementalWrites(operations) {
  if (!Array.isArray(operations) || operations.length === 0) return Promise.resolve();
  const write = () => writeIncrementalState(operations);
  writeQueue = writeQueue.then(write, write);
  return writeQueue;
}

export function putLocation(location) {
  return persistIncrementalWrites([{ type: 'location-put', action: 'putLocation', location }]);
}

export function deleteLocation(locationId) {
  return persistIncrementalWrites([{ type: 'location-delete', action: 'deleteLocation', locationId }]);
}

export function putTrip(trip, locationId) {
  return persistIncrementalWrites([{ type: 'trip-put', action: 'putTrip', trip, locationId }]);
}

export function deleteTrip(tripId) {
  return persistIncrementalWrites([{ type: 'trip-delete', action: 'deleteTrip', tripId }]);
}

export function putPhotoMetadata(photo, locationId, tripId) {
  return persistIncrementalWrites([{ type: 'photo-meta', action: 'putPhotoMetadata', photo, locationId, tripId }]);
}

export function putPhotoBlob(photoId, blob, metadata = {}) {
  return persistIncrementalWrites([{
    type: 'photo-asset',
    action: 'putPhotoBlob',
    photo: { ...metadata, id: photoId, assetId: photoId, blob },
    locationId: metadata.locationId,
    tripId: metadata.tripId,
  }]);
}

export function deletePhoto(photoId) {
  return persistIncrementalWrites([{ type: 'photo-delete', action: 'deletePhoto', photoId }]);
}

export function putSetting(key, value) {
  return persistIncrementalWrites([{ type: 'setting-put', action: 'putSetting', key, value }]);
}

async function writeTravelState(locations) {
  const { registrar, locationRecords, tripRecords } = buildRecords(locations);
  let photoRecords = [];
  for (const asset of registrar.assets.values()) photoRecords.push(await materializeAsset(asset));
  const db = await openDatabase();
  const existing = await Promise.all(STORE_NAMES.map(async (storeName) => {
    const readTransaction = db.transaction(storeName, 'readonly');
    const transactionComplete = transactionDone(readTransaction);
    const records = await requestValue(readTransaction.objectStore(storeName).getAll());
    await transactionComplete.catch(() => {});
    return [storeName, records];
  }));
  const existingMap = new Map(existing);
  const existingPhotoMap = new Map((existingMap.get('photos') || []).map((record) => [record.id, record]));
  photoRecords = photoRecords.map((record) => {
    if (record.blob) return record;
    const previous = existingPhotoMap.get(record.id);
    return previous?.blob ? { ...record, blob: previous.blob, hasBlob: true, sourceUrl: null } : record;
  });
  const photoMetadataRecords = photoRecords.map(photoMetadataRecord);
  const transaction = db.transaction(STORE_NAMES, 'readwrite');
  const locationStore = transaction.objectStore('locations');
  const tripStore = transaction.objectStore('trips');
  const photoStore = transaction.objectStore('photos');
  const photoMetadataStore = transaction.objectStore('photoMetadata');
  const settingsStore = transaction.objectStore('settings');
  const keepLocations = new Set(locationRecords.map((record) => record.id));
  const keepTrips = new Set(tripRecords.map((record) => record.id));
  const keepPhotos = new Set(photoRecords.map((record) => record.id));
  (existingMap.get('locations') || []).forEach((record) => { if (!keepLocations.has(record.id)) locationStore.delete(record.id); });
  (existingMap.get('trips') || []).forEach((record) => { if (!keepTrips.has(record.id)) tripStore.delete(record.id); });
  (existingMap.get('photos') || []).forEach((record) => {
    if (!keepPhotos.has(record.id)) { photoStore.delete(record.id); releaseRuntimeAsset(record.id); }
  });
  (existingMap.get('photoMetadata') || []).forEach((record) => {
    if (!keepPhotos.has(record.id)) {
      photoMetadataStore.delete(record.id);
      photoMetadataCache.delete(record.id);
    }
  });
  locationRecords.forEach((record) => locationStore.put(record));
  tripRecords.forEach((record) => tripStore.put(record));
  photoRecords.forEach((record) => photoStore.put(record));
  photoMetadataRecords.forEach((record) => {
    photoMetadataStore.put(record);
    photoMetadataCache.set(record.id, record);
    if (record.hasBlob || record.sourceUrl) photoLoadWarnings.delete(record.id);
  });
  settingsStore.put({ key: 'stateMeta', schemaVersion: 2, updatedAt: Date.now() });
  await transactionDone(transaction);
  db.close();
}

export function persistTravelState(locations) {
  const write = () => writeTravelState(locations);
  writeQueue = writeQueue.then(write, write);
  return writeQueue;
}

function readLegacyLocations(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export async function loadOrMigrateTravelState({ fallbackLocations, storageKey, normalizeLocation = (value) => value }) {
  let persisted;
  try {
    persisted = await loadTravelState();
    if (persisted) return { ...persisted, status: 'ready', source: 'indexeddb' };
  } catch (error) {
    // A read error is not proof that the database is empty. Never overwrite
    // it with localStorage/default data during startup recovery.
    console.error('[TravelMemory] IndexedDB 读取失败，保留现有数据库，不执行覆盖迁移。', error);
    const legacyLocations = readLegacyLocations(storageKey)?.map(normalizeLocation);
    return {
      locations: legacyLocations || fallbackLocations,
      stateMeta: null,
      status: 'storage-error',
      source: 'indexeddb-error',
      error,
    };
  }

  const legacyLocations = readLegacyLocations(storageKey)?.map(normalizeLocation);
  const seed = legacyLocations || fallbackLocations;
  try {
    await persistTravelState(seed);
    const verified = await loadTravelState();
    if (verified) {
      try { localStorage.removeItem(storageKey); } catch { /* keep the backup if storage is unavailable */ }
      return { ...verified, status: 'ready', source: legacyLocations ? 'migrated' : 'defaults' };
    }
  } catch (error) {
    console.warn('[TravelMemory] IndexedDB 保存失败，本次仅使用内存数据。', error);
    return { locations: seed, stateMeta: null, status: 'fallback', source: legacyLocations ? 'legacy' : 'defaults', error };
  }
  return { locations: seed, stateMeta: null, status: 'fallback', source: 'memory' };
}
