import assert from 'node:assert/strict';
import { countLocationPhotos } from '../src/utils/photoStatistics.js';

const day = (id, photos = [], slots = []) => ({ id, blocks: [
  { type: 'photos', data: { photos } },
  { type: 'itinerary', data: { slots } },
] });
const trip = (id, photos = [], days = []) => ({ id, photos, days });
const city = (id, trips = [], landscapeImages = [], landscapeImageAssetIds = []) => ({
  id, trips, landscapeImages, landscapeImageAssetIds,
});
const photo = (id, url = `blob:${id}`) => ({ id, assetId: id, url });
const a = photo('a');
const b = photo('b');

const cases = [
  ['没有城市', [], 0],
  ['城市没有照片', [city('hangzhou')], 0],
  ['只有城市概览照片', [city('hangzhou', [], ['blob:overview'], ['overview-1'])], 1],
  ['只有 Trip.photos', [city('hangzhou', [trip('t1', [a])])], 1],
  ['未分配 Day', [city('hangzhou', [trip('t1', [{ ...a, dayId: null }], [day('d1')])])], 1],
  ['Trip 与 Day 重复引用', [city('hangzhou', [trip('t1', [a], [day('d1', [a])])])], 1],
  ['多个 Day 重复引用', [city('hangzhou', [trip('t1', [a], [day('d1', [a]), day('d2', [a])])])], 1],
  ['多个 Trip 不同照片', [city('hangzhou', [trip('t1', [a]), trip('t2', [b])])], 2],
  ['多个 Trip 相同格式旧 ID', [city('hangzhou', [trip('t1', [a]), trip('t2', [photo('a', 'blob:other')])])], 2],
  ['删除照片后的状态', [city('hangzhou', [trip('t1', [b], [day('d1', [b])])])], 1],
  ['刷新后重建同一状态', [structuredClone(city('hangzhou', [trip('t1', [a], [day('d1', [a])])]))], 1],
  ['不同城市相同格式 ID', [city('hangzhou', [trip('t1', [a])]), city('guangzhou', [trip('t1', [photo('a', 'blob:other')])])], 2],
  ['旧数据仅 Day 引用', [city('hangzhou', [trip('t1', [], [day('d1', ['legacy-url'])])])], 1],
  ['旧数据 Trip 字符串和 Day 字符串', [city('hangzhou', [trip('t1', ['legacy-url'], [day('d1', ['legacy-url'])])])], 1],
  ['餐食照片只计算一次', [city('hangzhou', [trip('t1', [a], [day('d1', [], [{ breakfast: a }])])])], 1],
  ['不同 ID 相同 URL 是不同照片', [city('hangzhou', [trip('t1', [photo('a', 'same-url'), photo('b', 'same-url')])])], 2],
];

for (const [name, input, expected] of cases) {
  const actual = countLocationPhotos(input);
  assert.equal(actual, expected, name);
  console.log(`${name}: 预期 ${expected}，实际 ${actual}，通过`);
}
