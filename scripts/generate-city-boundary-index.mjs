import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(rootDir, 'public', 'china-cities.json');
const outputPath = path.join(rootDir, 'src', 'data', 'cityBoundaryIndex.js');

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const entries = (source.features || [])
  .filter((feature) => (
    feature?.properties?.level === 'city'
    && ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)
  ))
  .map((feature) => {
    const properties = feature.properties;
    const adcode = String(properties.adcode);
    const provinceAdcode = String(properties.parent?.adcode || (Math.floor(Number(adcode) / 10000) * 10000));
    const fullName = String(properties.name || '');
    const cityName = fullName.replace(/市$/, '');
    const [longitude, latitude] = Array.isArray(properties.center) ? properties.center : [];

    return {
      id: cityName,
      cityName,
      fullName,
      adcode,
      provinceAdcode,
      lng: longitude,
      lat: latitude,
    };
  })
  .filter((entry) => entry.id && Number.isFinite(entry.lng) && Number.isFinite(entry.lat));

const uniqueEntries = Array.from(new Map(entries.map((entry) => [entry.adcode, entry])).values());
const output = `const cityBoundaryIndex = ${JSON.stringify(uniqueEntries, null, 2)};\n\nexport default cityBoundaryIndex;\n`;
await writeFile(outputPath, output, 'utf8');

console.log(JSON.stringify({
  source: path.relative(rootDir, sourcePath),
  output: path.relative(rootDir, outputPath),
  cityCount: uniqueEntries.length,
}, null, 2));
