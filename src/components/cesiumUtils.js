import { Cartesian3 } from 'cesium';

// Create an arc between two lat/lng points, rising above the Earth surface
export function computeArcPositions(lat1, lng1, lat2, lng2, numPoints = 60, maxHeight = 300000) {
  const positions = [];

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const lat = lat1 + (lat2 - lat1) * t;
    const lng = lng1 + (lng2 - lng1) * t;
    const height = maxHeight * 4 * t * (1 - t);

    positions.push(Cartesian3.fromDegrees(lng, lat, height));
  }

  return positions;
}
