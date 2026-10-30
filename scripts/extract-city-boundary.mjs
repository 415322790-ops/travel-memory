import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(rootDir, 'public', 'china-cities.json');
const outputDir = path.join(rootDir, 'src', 'dev-data', 'city-boundaries');
const outputPath = path.join(outputDir, '440100.json');
const targetAdcode = 440100;

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const feature = source.features?.find((item) => Number(item.properties?.adcode) === targetAdcode);

if (!feature) {
  throw new Error(`City boundary not found for adcode ${targetAdcode}`);
}

if (!['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) {
  throw new Error(`Unsupported geometry type: ${feature.geometry?.type || 'unknown'}`);
}

const output = {
  type: 'FeatureCollection',
  features: [feature],
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output)}\n`, 'utf8');

const sourceBytes = (await readFile(sourcePath)).byteLength;
const outputBytes = (await readFile(outputPath)).byteLength;
console.log(JSON.stringify({
  source: path.relative(rootDir, sourcePath),
  output: path.relative(rootDir, outputPath),
  adcode: targetAdcode,
  featureCount: output.features.length,
  geometryType: feature.geometry.type,
  sourceBytes,
  outputBytes,
}, null, 2));
