// Visual anchors calculated from the current city boundary GeoJSON. These are
// display positions only; travel records keep their original coordinates.
const CITY_MARKER_CENTERS = {
  hulunbeier: { longitude: 121.589309, latitude: 49.280547 },
  haerbin: { longitude: 127.850217, latitude: 45.694410 },
  nanjing: { longitude: 118.737221, latitude: 31.987745 },
  suzhou: { longitude: 120.500889, latitude: 31.176521 },
  hangzhou: { longitude: 119.414604, latitude: 29.912089 },
  xiamen: { longitude: 118.119446, latitude: 24.720505 },
  nanchang: { longitude: 115.973918, latitude: 28.664568 },
  qingdao: { longitude: 120.212671, latitude: 36.716426 },
  wuhan: { longitude: 114.254048, latitude: 30.456501 },
  changsha: { longitude: 113.432807, latitude: 28.254853 },
  guangzhou: { longitude: 113.482621, latitude: 23.365852 },
  shenzhen: { longitude: 113.970535, latitude: 22.638049 },
  guilin: { longitude: 110.415113, latitude: 25.375519 },
  sanya: { longitude: 109.371164, latitude: 18.383499 },
  chengdu: { longitude: 103.801695, latitude: 30.694848 },
  guiyang: { longitude: 106.730988, latitude: 26.916675 },
  kunming: { longitude: 102.845623, latitude: 25.787353 },
  lijiang: { longitude: 100.607712, latitude: 27.002184 },
  lasa: { longitude: 91.190080, latitude: 30.101446 },
  xian: { longitude: 109.121373, latitude: 34.192373 },
  wulumuqi: { longitude: 87.668508, latitude: 43.643140 },
};

export function getCityMarkerCenter(cityId, fallback) {
  const center = CITY_MARKER_CENTERS[String(cityId || '').trim()];
  return center
    ? { lng: center.longitude, lat: center.latitude }
    : fallback;
}
