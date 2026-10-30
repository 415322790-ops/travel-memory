import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cloudPhotoFromRow,
  hydrateCloudPhoto,
  hydrateCloudTripPhotos,
} from '../src/utils/cloudPhotoHydration.js';

const row = (id, metadata = {}, storagePath = `owner/trip/${id}.jpg`) => ({
  id, metadata, storage_path: storagePath,
});
const mapOf = (...rows) => new Map(rows.map((item) => [item.id, cloudPhotoFromRow(item)]));
const day = (id, photos = [], extraBlocks = []) => ({
  id,
  blocks: [{ id: `${id}-photos`, type: 'photos', data: { photos } }, ...extraBlocks],
});
const refsOf = (dayValue) => dayValue.blocks
  .filter((block) => block.type === 'photos')
  .flatMap((block) => block.data.photos);

test('new metadata wins over stale Trip/Day refs and moves to its real Day', () => {
  const photoMap = mapOf(row('a', { dayId: 'd2', rotation: 90, crop: { x: 0.2 } }));
  const result = hydrateCloudTripPhotos(
    [{ id: 'a', dayId: 'd1', rotation: 180, crop: { x: 0.8 } }],
    [day('d1', [{ id: 'a', dayId: 'd1' }]), day('d2')], photoMap,
  );
  assert.deepEqual(result.photos.map(({ id, dayId, rotation, crop }) => ({ id, dayId, rotation, crop })),
    [{ id: 'a', dayId: 'd2', rotation: 90, crop: { x: 0.2 } }]);
  assert.equal(refsOf(result.days[0]).length, 0);
  assert.deepEqual(refsOf(result.days[1]).map((photo) => photo.id), ['a']);
});

test('missing metadata fields fall back to the old Trip reference', () => {
  const photo = hydrateCloudPhoto(
    { id: 'a', dayId: 'd1', rotation: 270, crop: { y: 0.3 } }, mapOf(row('a')),
  );
  assert.equal(photo.dayId, 'd1');
  assert.equal(photo.rotation, 270);
  assert.deepEqual(photo.crop, { y: 0.3 });
});

test('a missing Trip field can fall back to an old Day reference', () => {
  const result = hydrateCloudTripPhotos([{ id: 'a' }],
    [day('d1', [{ id: 'a', dayId: 'd1', rotation: 180 }])], mapOf(row('a')));
  assert.equal(result.photos[0].dayId, 'd1');
  assert.equal(result.photos[0].rotation, 180);
  assert.equal(refsOf(result.days[0]).length, 1);
});

test('explicit null dayId wins and leaves the photo unfiled', () => {
  const result = hydrateCloudTripPhotos([{ id: 'a', dayId: 'd1' }],
    [day('d1', [{ id: 'a' }])], mapOf(row('a', { dayId: null })));
  assert.equal(result.photos[0].dayId, null);
  assert.equal(refsOf(result.days[0]).length, 0);
});

test('rotation 0 wins over a stale nonzero rotation', () => {
  assert.equal(hydrateCloudPhoto({ id: 'a', rotation: 180 }, mapOf(row('a', { rotation: 0 }))).rotation, 0);
});

test('crop metadata wins over a stale crop', () => {
  const crop = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
  assert.deepEqual(hydrateCloudPhoto({ id: 'a', crop: { x: 0.9 } }, mapOf(row('a', { crop }))).crop, crop);
  assert.equal(hydrateCloudPhoto({ id: 'a', crop }, mapOf(row('a', { crop: null }))).crop, null);
});

test('rotation and crop survive together', () => {
  const photo = hydrateCloudPhoto({ id: 'a', rotation: 90, crop: null },
    mapOf(row('a', { rotation: 270, crop: { x: 0.4 } })));
  assert.equal(photo.rotation, 270);
  assert.deepEqual(photo.crop, { x: 0.4 });
});

test('the same photo in multiple Day blocks keeps one reference in the target Day', () => {
  const result = hydrateCloudTripPhotos([{ id: 'a' }, { id: 'a' }],
    [day('d1', [{ id: 'a' }, { id: 'a' }]), day('d2', [{ id: 'a' }])],
    mapOf(row('a', { dayId: 'd2' })));
  assert.equal(result.photos.length, 1);
  assert.equal(refsOf(result.days[0]).length, 0);
  assert.deepEqual(refsOf(result.days[1]).map((photo) => photo.id), ['a']);
});

test('a missing target Day leaves the photo unfiled without inventing a Day', () => {
  const result = hydrateCloudTripPhotos([{ id: 'a' }],
    [day('d1', [{ id: 'a' }])], mapOf(row('a', { dayId: 'deleted-day' })));
  assert.equal(result.photos[0].dayId, 'deleted-day');
  assert.equal(refsOf(result.days[0]).length, 0);
  assert.equal(result.days.length, 1);
});

test('missing database rows preserve a valid original ID and URL', () => {
  const photo = hydrateCloudPhoto({ id: 'legacy-a', url: 'https://example.test/old.jpg' }, new Map());
  assert.equal(photo.id, 'legacy-a');
  assert.equal(photo.url, 'https://example.test/old.jpg');
  assert.deepEqual(hydrateCloudPhoto('legacy-b', new Map()), { id: 'legacy-b', assetId: 'legacy-b', url: '' });
  const trip = hydrateCloudTripPhotos([{ id: 'legacy-a', dayId: 'd1', url: photo.url }],
    [day('d1', [{ id: 'legacy-a' }])], new Map());
  assert.equal(trip.photos[0].id, 'legacy-a');
  assert.equal(refsOf(trip.days[0])[0].id, 'legacy-a');
});

test('legacy string and photoIds references remain readable', () => {
  const result = hydrateCloudTripPhotos(['a', 'https://example.test/old.jpg'],
    [{ id: 'd1', blocks: [{ id: 'old', type: 'photos', photoIds: ['a'] }] }],
    mapOf(row('a', { dayId: 'd1' })));
  assert.equal(result.photos[0].id, 'a');
  assert.equal(result.photos[1], 'https://example.test/old.jpg');
  assert.equal(refsOf(result.days[0])[0].id, 'a');
});

test('different photo IDs are never merged merely because URLs match', () => {
  const result = hydrateCloudTripPhotos([
    { id: 'a', sourceUrl: 'https://example.test/same.jpg' },
    { id: 'b', sourceUrl: 'https://example.test/same.jpg' },
  ], [], new Map());
  assert.deepEqual(result.photos.map((photo) => photo.id), ['a', 'b']);
});

test('the database Storage path and ID override stale reference fields', () => {
  const photo = hydrateCloudPhoto({ id: 'a', assetId: 'a', storagePath: 'old/path.jpg' },
    mapOf(row('a', { dayId: 'd1' }, 'owner/new/path.jpg')));
  assert.equal(photo.id, 'a');
  assert.equal(photo.assetId, 'a');
  assert.equal(photo.storagePath, 'owner/new/path.jpg');
});

test('a Day-only legacy reference remains in Trip.photos for Film', () => {
  const result = hydrateCloudTripPhotos([], [day('d1', [{ id: 'a' }])], mapOf(row('a', { dayId: 'd1' })));
  assert.deepEqual(result.photos.map((photo) => photo.id), ['a']);
  assert.deepEqual(refsOf(result.days[0]).map((photo) => photo.id), ['a']);
});

test('a valid target Day with no photos block receives a runtime reference', () => {
  const result = hydrateCloudTripPhotos([{ id: 'a' }],
    [{ id: 'd1', blocks: [{ id: 'journal', type: 'feeling', data: { text: '记忆' } }] }],
    mapOf(row('a', { dayId: 'd1' })));
  assert.deepEqual(refsOf(result.days[0]).map((photo) => photo.id), ['a']);
  assert.equal(result.days[0].blocks[0].id, 'journal');
});

test('hydration does not mutate stored Trip/Day references', () => {
  const tripRefs = [{ id: 'a', dayId: 'd1' }];
  const days = [day('d1', [{ id: 'a' }])];
  const snapshot = structuredClone({ tripRefs, days });
  hydrateCloudTripPhotos(tripRefs, days, mapOf(row('a', { dayId: 'd1' })));
  assert.deepEqual({ tripRefs, days }, snapshot);
});
