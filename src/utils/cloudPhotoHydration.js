// Cloud photo rows own mutable metadata; Trip and Day entries are references.
// Keep this normalization free of storage/network dependencies for regression tests.
function photoId(reference) {
  if (typeof reference === 'string') {
    return /^(?:https?:|data:|blob:)/i.test(reference) ? '' : reference;
  }
  return reference && typeof reference === 'object' ? reference.assetId || reference.id || '' : '';
}

function photoKey(reference) {
  const id = photoId(reference);
  if (id) return `id:${id}`;
  const url = typeof reference === 'string'
    ? reference
    : reference?.sourceUrl || reference?.url || '';
  return url ? `legacy:${url}` : '';
}

function photoReferences(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(photoReferences);
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (typeof value !== 'object') return [];
  if (photoKey(value)) return [value];
  return photoReferences(value.photos ?? value.photoIds);
}

function usableUrl(url) {
  return typeof url === 'string' && !url.startsWith('blob:') ? url : '';
}

export function cloudPhotoFromRow(row) {
  const metadata = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata : {};
  return {
    ...metadata,
    id: row.id,
    assetId: row.id,
    storagePath: row.storage_path || '',
    sourceUrl: metadata.sourceUrl || '',
    url: '',
    hasBlob: Boolean(row.storage_path),
  };
}

export function hydrateCloudPhoto(reference, photoMap) {
  if (!reference) return null;
  const id = photoId(reference);
  const remote = id ? photoMap.get(id) : null;
  const original = reference && typeof reference === 'object' ? reference : null;
  if (!remote) {
    if (original) return {
      ...original,
      id: id || original.id || '',
      assetId: id || original.assetId || '',
      url: usableUrl(original.url),
    };
    return id ? { id, assetId: id, url: '' } : reference;
  }

  // Spreading the row last preserves present metadata, including null and 0.
  // A missing metadata field still falls back to the older reference.
  const storagePath = remote.storagePath || original?.storagePath || original?.storage_path || '';
  return {
    ...(original || {}),
    ...remote,
    id: remote.id,
    assetId: remote.id,
    storagePath,
    sourceUrl: remote.sourceUrl || original?.sourceUrl || '',
    url: storagePath ? '' : usableUrl(remote.url || original?.url),
    hasBlob: Boolean(storagePath || remote.hasBlob || original?.hasBlob),
  };
}

function fillMissingMetadata(primary, fallback) {
  if (!primary || typeof primary !== 'object' || !fallback || typeof fallback !== 'object') return primary;
  const next = { ...primary };
  for (const field of ['dayId', 'rotation', 'crop']) {
    if (!Object.hasOwn(next, field) && Object.hasOwn(fallback, field)) next[field] = fallback[field];
  }
  return next;
}

export function hydrateCloudTripPhotos(tripReferences, rawDays, photoMap) {
  const photos = [];
  const byKey = new Map();
  const addPhoto = (reference) => {
    const hydrated = hydrateCloudPhoto(reference, photoMap);
    if (!hydrated) return null;
    const key = photoKey(hydrated);
    if (!key) {
      photos.push(hydrated);
      return hydrated;
    }
    if (!byKey.has(key)) {
      byKey.set(key, hydrated);
      photos.push(hydrated);
    } else {
      const current = byKey.get(key);
      const merged = fillMissingMetadata(current, hydrated);
      byKey.set(key, merged);
      photos[photos.indexOf(current)] = merged;
    }
    return byKey.get(key);
  };

  photoReferences(tripReferences).forEach(addPhoto);
  const days = (Array.isArray(rawDays) ? rawDays : []).map((day) => ({
    ...day,
    blocks: (Array.isArray(day?.blocks) ? day.blocks : []).map((block) => {
      if (block?.type === 'photos') {
        const refs = block.data?.photos?.length ? block.data.photos : block.photoIds || block.data?.photos;
        return { ...block, data: { ...block.data, photos: photoReferences(refs).map(addPhoto).filter(Boolean) } };
      }
      if (block?.type !== 'itinerary') return block;
      return {
        ...block,
        data: {
          ...block.data,
          slots: (block.data?.slots || []).map((slot) => ({
            ...slot,
            breakfast: hydrateCloudPhoto(slot.breakfast, photoMap),
            lunch: hydrateCloudPhoto(slot.lunch, photoMap),
            dinner: hydrateCloudPhoto(slot.dinner, photoMap),
          })),
        },
      };
    }),
  }));

  const dayIds = new Set(days.map((day) => day.id));
  const placed = new Set();
  const normalizedDays = days.map((day) => {
    const blocks = day.blocks.map((block) => {
      if (block.type !== 'photos') return block;
      const refs = (block.data?.photos || []).flatMap((reference) => {
        const key = photoKey(reference);
        const canonical = key ? byKey.get(key) : null;
        if (!canonical || canonical.dayId !== day.id || placed.has(key)) return [];
        placed.add(key);
        return [canonical];
      });
      return { ...block, data: { ...block.data, photos: refs } };
    });
    const missing = photos.filter((photo) => {
      const key = photoKey(photo);
      if (!key || photo.dayId !== day.id || !dayIds.has(photo.dayId) || placed.has(key)) return false;
      placed.add(key);
      return true;
    });
    if (missing.length) {
      const first = blocks.findIndex((block) => block.type === 'photos');
      if (first >= 0) {
        const block = blocks[first];
        blocks[first] = { ...block, data: { ...block.data, photos: [...block.data.photos, ...missing] } };
      } else {
        const existingIds = new Set(blocks.map((block) => block.id));
        const baseId = `cloud-recovered-photos-${day.id}`;
        let id = baseId;
        for (let index = 2; existingIds.has(id); index += 1) id = `${baseId}-${index}`;
        blocks.push({ id, type: 'photos', data: { photos: missing } });
      }
    }
    return { ...day, blocks };
  });

  return { photos, days: normalizedDays };
}
