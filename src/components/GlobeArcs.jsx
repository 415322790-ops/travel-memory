import { useMemo } from 'react';
import { Entity, PolylineGraphics, BillboardGraphics } from 'resium';
import {
  Color,
  PolylineDashMaterialProperty,
  SampledPositionProperty,
  JulianDate,
  Cartesian3,
  VerticalOrigin,
  HorizontalOrigin,
  ExtrapolationType,
  LagrangePolynomialApproximation,
  CallbackProperty,
} from 'cesium';
import { computeArcPositions } from './cesiumUtils';

function createVehicleIcon(method) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.font = '22px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const icons = { plane: '✈️', train: '🚄', car: '🚗' };
  ctx.fillText(icons[method] || '📍', 16, 16);
  return canvas.toDataURL();
}

const planeIcon = createVehicleIcon('plane');
const trainIcon = createVehicleIcon('train');
const carIcon = createVehicleIcon('car');
const METHOD_ICONS = { plane: planeIcon, train: trainIcon, car: carIcon };

function createArcAnimation(lat1, lng1, lat2, lng2, durationSeconds = 8) {
  const property = new SampledPositionProperty();
  property.setInterpolationOptions({
    interpolationDegree: 2,
    interpolationAlgorithm: LagrangePolynomialApproximation,
  });

  const start = JulianDate.now();
  const totalPoints = 60;
  const maxHeight = 300000;

  for (let i = 0; i <= totalPoints; i++) {
    const t = i / totalPoints;
    const lat = lat1 + (lat2 - lat1) * t;
    const lng = lng1 + (lng2 - lng1) * t;
    const height = maxHeight * 4 * t * (1 - t);
    const time = JulianDate.addSeconds(start, t * durationSeconds, new JulianDate());
    const position = Cartesian3.fromDegrees(lng, lat, height);
    property.addSample(time, position);
  }

  property.forwardExtrapolationType = ExtrapolationType.CYCLE;
  property.backwardExtrapolationType = ExtrapolationType.CYCLE;

  return property;
}

// Shared flashing color — pulses alpha with sin wave
function flashingWhite() {
  return new CallbackProperty((time) => {
    const alpha = 0.25 + 0.65 * (0.5 + 0.5 * Math.sin(time.secondsOfDay * 5));
    return Color.WHITE.withAlpha(alpha);
  }, false);
}

function routeDuration(from, to) {
  const seed = `${from.id || from.name}-${to.id || to.name}-${from.lat}-${to.lng}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return 8 + (hash % 400) / 100;
}

function TravelRoute({ from, to, method }) {
  const arcPositions = useMemo(
    () => computeArcPositions(from.lat, from.lng, to.lat, to.lng),
    [from.lat, from.lng, to.lat, to.lng],
  );

  const duration = useMemo(() => routeDuration(from, to), [from, to]);

  const animProperty = useMemo(
    () => createArcAnimation(from.lat, from.lng, to.lat, to.lng, duration),
    [from.lat, from.lng, to.lat, to.lng, duration],
  );

  const dashMaterial = useMemo(
    () =>
      new PolylineDashMaterialProperty({
        color: flashingWhite(),
        dashLength: 14,
      }),
    [],
  );

  const iconUrl = METHOD_ICONS[method] || METHOD_ICONS.plane;

  return (
    <>
      <Entity>
        <PolylineGraphics
          positions={arcPositions}
          width={2}
          material={dashMaterial}
          clampToGround={false}
        />
      </Entity>

      <Entity position={animProperty}>
        <BillboardGraphics
          image={iconUrl}
          scale={0.6}
          verticalOrigin={VerticalOrigin.CENTER}
          horizontalOrigin={HorizontalOrigin.CENTER}
        />
      </Entity>
    </>
  );
}

export default function GlobeArcs({ locations }) {
  const routes = useMemo(() => {
    const result = [];
    for (let i = 1; i < locations.length; i++) {
      const from = locations[i - 1];
      const to = locations[i];
      if (to.travelFrom && to.travelFrom === from.id) {
        result.push({
          key: `${from.id}-${to.id}`,
          from,
          to,
          method: to.travelMethod || 'plane',
        });
      }
    }
    return result;
  }, [locations]);

  return (
    <>
      {routes.map(({ key, from, to, method }) => (
        <TravelRoute key={key} from={from} to={to} method={method} />
      ))}
    </>
  );
}

