function photoIdentity(photo) {
  if (!photo) return null;
  if (typeof photo === 'string') return photo ? { url: photo } : null;
  if (typeof photo !== 'object') return null;
  const id = photo.assetId || photo.id;
  const url = photo.url || photo.src || photo.sourceUrl;
  return id || url ? { id: id ? String(id) : '', url: url || '' } : null;
}

function countDistinctPhotos(photos) {
  const ids = new Set();
  const urls = new Set();
  let count = 0;
  photos.forEach((photo) => {
    const identity = photoIdentity(photo);
    if (!identity) return;
    if (identity.id) {
      if (ids.has(identity.id)) return;
      ids.add(identity.id);
      if (identity.url) urls.add(identity.url);
    } else {
      if (urls.has(identity.url)) return;
      urls.add(identity.url);
    }
    count += 1;
  });
  return count;
}

export function countLocationPhotos(locations) {
  if (!Array.isArray(locations)) return 0;
  return locations.reduce((total, location) => {
    // Keep overview and each trip in separate scopes: legacy IDs and URLs can
    // repeat across cities or trips without referring to the same photo.
    const overview = Array.isArray(location?.landscapeImages) ? location.landscapeImages : [];
    const overviewPhotos = overview.map((photo, index) => {
      if (photo && typeof photo === 'object') return photo;
      const assetId = location.landscapeImageAssetIds?.[index];
      return assetId ? { assetId, url: photo } : photo;
    });
    const tripCount = (Array.isArray(location?.trips) ? location.trips : []).reduce((sum, trip) => {
      const photos = [...(Array.isArray(trip?.photos) ? trip.photos : [])];
      (Array.isArray(trip?.days) ? trip.days : []).forEach((day) => {
        (Array.isArray(day?.blocks) ? day.blocks : []).forEach((block) => {
          if (block?.type === 'photos') {
            photos.push(...(Array.isArray(block.data?.photos) ? block.data.photos : []));
          } else if (block?.type === 'itinerary') {
            (Array.isArray(block.data?.slots) ? block.data.slots : []).forEach((slot) => {
              ['breakfast', 'lunch', 'dinner'].forEach((meal) => {
                if (slot?.[meal]) photos.push(slot[meal]);
              });
            });
          }
        });
      });
      return sum + countDistinctPhotos(photos);
    }, 0);
    return total + countDistinctPhotos(overviewPhotos) + tripCount;
  }, 0);
}
