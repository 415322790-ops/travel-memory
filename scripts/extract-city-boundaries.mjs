import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(rootDir, 'public', 'china-cities.json');
const outputDir = path.join(rootDir, 'src', 'dev-data', 'city-boundaries');

const targets = [
  { cityId: 'guangzhou', cityName: '广州', adcode: 440100 },
  { cityId: 'shenzhen', cityName: '深圳', adcode: 440300 },
  { cityId: 'chengdu', cityName: '成都', adcode: 510100 },
  { cityId: 'hangzhou', cityName: '杭州', adcode: 330100 },
  { cityId: 'nanjing', cityName: '南京', adcode: 320100 },
  { cityId: 'wuhan', cityName: '武汉', adcode: 420100 },
  { cityId: 'xian', cityName: '西安', adcode: 610100 },
  { cityId: 'changsha', cityName: '长沙', adcode: 430100 },
  { cityId: 'xiamen', cityName: '厦门', adcode: 350200 },
  { cityId: 'kunming', cityName: '昆明', adcode: 530100 },
  { cityId: 'lijiang', cityName: '丽江', adcode: 530700 },
  { cityId: 'sanya', cityName: '三亚', adcode: 460200 },
  { cityId: 'lasa', cityName: '拉萨', adcode: 540100 },
  { cityId: 'haerbin', cityName: '哈尔滨', adcode: 230100 },
  { cityId: 'qingdao', cityName: '青岛', adcode: 370200 },
  { cityId: 'guilin', cityName: '桂林', adcode: 450300 },
  { cityId: 'suzhou', cityName: '苏州', adcode: 320500 },
  { cityId: 'guiyang', cityName: '贵阳', adcode: 520100 },
  { cityId: 'wulumuqi', cityName: '乌鲁木齐', adcode: 650100 },
  { cityId: 'hulunbeier', cityName: '呼伦贝尔', adcode: 150700 },
  { cityId: 'nanchang', cityName: '南昌', adcode: 360100 },
];

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
await mkdir(outputDir, { recursive: true });

const results = [];
for (const target of targets) {
  const feature = source.features?.find((item) => (
    Number(item.properties?.adcode) === target.adcode
    && ['Polygon', 'MultiPolygon'].includes(item.geometry?.type)
  ));

  if (!feature) {
    results.push({ ...target, status: 'missing' });
    continue;
  }

  const outputPath = path.join(outputDir, String(target.adcode) + '.json');
  const output = {
    type: 'FeatureCollection',
    features: [feature],
  };
  await writeFile(outputPath, JSON.stringify(output) + '\n', 'utf8');
  results.push({
    ...target,
    status: 'written',
    geometry: feature.geometry.type,
    bytes: Buffer.byteLength(JSON.stringify(output)),
  });
}

console.log(JSON.stringify({
  source: path.relative(rootDir, sourcePath),
  outputDir: path.relative(rootDir, outputDir),
  results,
}, null, 2));

