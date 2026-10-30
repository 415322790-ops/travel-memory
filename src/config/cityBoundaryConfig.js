import cityBoundaryIndex from '../data/cityBoundaryIndex';

const CITY_BOUNDARY_CONFIG = {
  beijing: {
    cityId: 'beijing',
    cityName: '北京',
    adcode: '110000',
    memoryCenter: { longitude: 116.4074, latitude: 39.9042 },
    boundaryLoader: () => loadMunicipalityBoundary('110000'),
  },
  tianjin: {
    cityId: 'tianjin',
    cityName: '天津',
    adcode: '120000',
    memoryCenter: { longitude: 117.1909, latitude: 39.1252 },
    boundaryLoader: () => loadMunicipalityBoundary('120000'),
  },
  shanghai: {
    cityId: 'shanghai',
    cityName: '上海',
    adcode: '310000',
    memoryCenter: { longitude: 121.4737, latitude: 31.2304 },
    boundaryLoader: () => loadMunicipalityBoundary('310000'),
  },
  chongqing: {
    cityId: 'chongqing',
    cityName: '重庆',
    adcode: '500000',
    memoryCenter: { longitude: 106.9123, latitude: 29.4316 },
    boundaryLoader: () => loadMunicipalityBoundary('500000'),
  },
  guangzhou: {
    cityId: 'guangzhou',
    cityName: '广州',
    adcode: '440100',
    memoryCenter: { longitude: 113.2644, latitude: 23.1291 },
    boundaryLoader: () => import('../dev-data/city-boundaries/440100.json'),
  },
  shenzhen: {
    cityId: 'shenzhen',
    cityName: '深圳',
    adcode: '440300',
    memoryCenter: { longitude: 114.0579, latitude: 22.5431 },
    boundaryLoader: () => import('../dev-data/city-boundaries/440300.json'),
  },
  'hong-kong': {
    cityId: 'hong-kong',
    cityName: '香港',
    adcode: '810000',
    memoryCenter: { longitude: 114.1694, latitude: 22.3193 },
    boundaryLoader: () => import('../dev-data/city-boundaries/810000.json'),
  },
  macau: {
    cityId: 'macau',
    cityName: '澳门',
    adcode: '820000',
    memoryCenter: { longitude: 113.5439, latitude: 22.1987 },
    boundaryLoader: () => import('../dev-data/city-boundaries/820000.json'),
  },
  chengdu: {
    cityId: 'chengdu',
    cityName: '成都',
    adcode: '510100',
    memoryCenter: { longitude: 104.0668, latitude: 30.5728 },
    boundaryLoader: () => import('../dev-data/city-boundaries/510100.json'),
  },
  hangzhou: {
    cityId: 'hangzhou',
    cityName: '杭州',
    adcode: '330100',
    memoryCenter: { longitude: 120.1551, latitude: 30.2741 },
    boundaryLoader: () => import('../dev-data/city-boundaries/330100.json'),
  },
  nanjing: {
    cityId: 'nanjing',
    cityName: '南京',
    adcode: '320100',
    memoryCenter: { longitude: 118.7969, latitude: 32.0603 },
    boundaryLoader: () => import('../dev-data/city-boundaries/320100.json'),
  },
  wuhan: {
    cityId: 'wuhan',
    cityName: '武汉',
    adcode: '420100',
    memoryCenter: { longitude: 114.3055, latitude: 30.5928 },
    boundaryLoader: () => import('../dev-data/city-boundaries/420100.json'),
  },
  xian: {
    cityId: 'xian',
    cityName: '西安',
    adcode: '610100',
    memoryCenter: { longitude: 108.9398, latitude: 34.3416 },
    boundaryLoader: () => import('../dev-data/city-boundaries/610100.json'),
  },
  changsha: {
    cityId: 'changsha',
    cityName: '长沙',
    adcode: '430100',
    memoryCenter: { longitude: 112.9388, latitude: 28.228 },
    boundaryLoader: () => import('../dev-data/city-boundaries/430100.json'),
  },
  xiamen: {
    cityId: 'xiamen',
    cityName: '厦门',
    adcode: '350200',
    memoryCenter: { longitude: 118.0894, latitude: 24.4798 },
    boundaryLoader: () => import('../dev-data/city-boundaries/350200.json'),
  },
  kunming: {
    cityId: 'kunming',
    cityName: '昆明',
    adcode: '530100',
    memoryCenter: { longitude: 102.7183, latitude: 25.0389 },
    boundaryLoader: () => import('../dev-data/city-boundaries/530100.json'),
  },
  lijiang: {
    cityId: 'lijiang',
    cityName: '丽江',
    adcode: '530700',
    memoryCenter: { longitude: 100.2299, latitude: 26.8721 },
    boundaryLoader: () => import('../dev-data/city-boundaries/530700.json'),
  },
  sanya: {
    cityId: 'sanya',
    cityName: '三亚',
    adcode: '460200',
    memoryCenter: { longitude: 109.512, latitude: 18.2528 },
    boundaryLoader: () => import('../dev-data/city-boundaries/460200.json'),
  },
  lasa: {
    cityId: 'lasa',
    cityName: '拉萨',
    adcode: '540100',
    memoryCenter: { longitude: 91.1, latitude: 29.65 },
    boundaryLoader: () => import('../dev-data/city-boundaries/540100.json'),
  },
  haerbin: {
    cityId: 'haerbin',
    cityName: '哈尔滨',
    adcode: '230100',
    memoryCenter: { longitude: 126.535, latitude: 45.8038 },
    boundaryLoader: () => import('../dev-data/city-boundaries/230100.json'),
  },
  qingdao: {
    cityId: 'qingdao',
    cityName: '青岛',
    adcode: '370200',
    memoryCenter: { longitude: 120.3826, latitude: 36.0671 },
    boundaryLoader: () => import('../dev-data/city-boundaries/370200.json'),
  },
  guilin: {
    cityId: 'guilin',
    cityName: '桂林',
    adcode: '450300',
    memoryCenter: { longitude: 110.29, latitude: 25.2736 },
    boundaryLoader: () => import('../dev-data/city-boundaries/450300.json'),
  },
  suzhou: {
    cityId: 'suzhou',
    cityName: '苏州',
    adcode: '320500',
    memoryCenter: { longitude: 120.5853, latitude: 31.299 },
    boundaryLoader: () => import('../dev-data/city-boundaries/320500.json'),
  },
  guiyang: {
    cityId: 'guiyang',
    cityName: '贵阳',
    adcode: '520100',
    memoryCenter: { longitude: 106.63, latitude: 26.647 },
    boundaryLoader: () => import('../dev-data/city-boundaries/520100.json'),
  },
  wulumuqi: {
    cityId: 'wulumuqi',
    cityName: '乌鲁木齐',
    adcode: '650100',
    memoryCenter: { longitude: 87.6169, latitude: 43.8256 },
    boundaryLoader: () => import('../dev-data/city-boundaries/650100.json'),
  },
  hulunbeier: {
    cityId: 'hulunbeier',
    cityName: '呼伦贝尔',
    adcode: '150700',
    memoryCenter: { longitude: 119.7658, latitude: 49.2116 },
    boundaryLoader: () => import('../dev-data/city-boundaries/150700.json'),
  },
  nanchang: {
    cityId: 'nanchang',
    cityName: '南昌',
    adcode: '360100',
    memoryCenter: { longitude: 115.8579, latitude: 28.682 },
    boundaryLoader: () => import('../dev-data/city-boundaries/360100.json'),
  },
};

const PUBLIC_ASSET_BASE = String(import.meta.env.BASE_URL || '/');
const cityBoundarySourceCache = new Map();

function getPublicAssetUrl(path) {
  const base = PUBLIC_ASSET_BASE.endsWith('/') ? PUBLIC_ASSET_BASE : PUBLIC_ASSET_BASE + '/';
  return base + path;
}

function loadCityBoundary(entry) {
  const sourceKey = `city-source:${entry.provinceAdcode}`;
  if (!cityBoundarySourceCache.has(sourceKey)) {
    const sourcePromise = fetch(getPublicAssetUrl(`cities/${entry.provinceAdcode}.json`))
      .then((response) => {
        if (!response.ok) throw new Error(`City boundary request failed: ${response.status}`);
        return response.json();
      });
    cityBoundarySourceCache.set(sourceKey, sourcePromise);
  }

  return cityBoundarySourceCache.get(sourceKey).then((source) => {
    const feature = source?.features?.find((item) => String(item?.properties?.adcode) === String(entry.adcode));
    if (!feature) throw new Error(`City boundary not found for adcode ${entry.adcode}`);
    return feature;
  });
}

function loadMunicipalityBoundary(adcode) {
  const sourceKey = 'municipality-source';
  if (!cityBoundarySourceCache.has(sourceKey)) {
    const sourcePromise = fetch(getPublicAssetUrl('china-provinces.json'))
      .then((response) => {
        if (!response.ok) throw new Error(`Municipality boundary request failed: ${response.status}`);
        return response.json();
      });
    cityBoundarySourceCache.set(sourceKey, sourcePromise);
  }

  return cityBoundarySourceCache.get(sourceKey).then((source) => {
    const feature = source?.features?.find((item) => String(item?.properties?.adcode) === String(adcode));
    if (!feature) throw new Error(`Municipality boundary not found for adcode ${adcode}`);
    return feature;
  });
}

const INDEXED_CITY_BOUNDARY_CONFIG = Object.fromEntries(
  cityBoundaryIndex.map((city) => [city.id, {
    cityId: city.id,
    cityName: city.cityName,
    adcode: city.adcode,
    memoryCenter: { longitude: city.lng, latitude: city.lat },
    boundaryLoader: () => loadCityBoundary(city),
  }]),
);

const INDEXED_CITY_ID_ALIASES = Object.fromEntries(
  cityBoundaryIndex.flatMap((city) => [
    [city.id, city.id],
    [city.cityName, city.id],
    [city.fullName, city.id],
    [city.adcode, city.id],
  ]),
);

const CITY_ID_ALIASES = {
  ...Object.fromEntries(
    Object.values(CITY_BOUNDARY_CONFIG).map((config) => [config.cityName, config.cityId]),
  ),
  '香港特别行政区': 'hong-kong',
  'Hong Kong': 'hong-kong',
  'Hong Kong SAR': 'hong-kong',
  'hong kong': 'hong-kong',
  'hong kong sar': 'hong-kong',
  hongkong: 'hong-kong',
  'hong-kong': 'hong-kong',
  '810000': 'hong-kong',
  '澳门特别行政区': 'macau',
  Macau: 'macau',
  Macao: 'macau',
  macau: 'macau',
  macao: 'macau',
  '820000': 'macau',
};

export { CITY_BOUNDARY_CONFIG };

export function getCityBoundaryConfig(cityId) {
  const key = String(cityId || '').trim();
  const normalizedKey = key.toLowerCase();
  const cityCanonicalId = CITY_BOUNDARY_CONFIG[key]
    ? key
    : CITY_BOUNDARY_CONFIG[normalizedKey]
      ? normalizedKey
      : CITY_ID_ALIASES[key] || CITY_ID_ALIASES[normalizedKey];
  const indexedCityCanonicalId = INDEXED_CITY_BOUNDARY_CONFIG[key]
    ? key
    : INDEXED_CITY_BOUNDARY_CONFIG[normalizedKey]
      ? normalizedKey
      : INDEXED_CITY_ID_ALIASES[key] || INDEXED_CITY_ID_ALIASES[normalizedKey];
  const config = cityCanonicalId
    ? CITY_BOUNDARY_CONFIG[cityCanonicalId]
    : indexedCityCanonicalId
      ? INDEXED_CITY_BOUNDARY_CONFIG[indexedCityCanonicalId]
      : null;
  if (!config) return null;

  return config.cityId === key
    ? config
    : { ...config, cityId: key || config.cityId };
}

