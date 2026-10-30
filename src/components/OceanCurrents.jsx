import { useMemo } from 'react';
import { Entity, PolylineGraphics } from 'resium';
import { Cartesian3, Color, PolylineArrowMaterialProperty, CallbackProperty, DistanceDisplayCondition, NearFarScalar } from 'cesium';
import oceanCurrents from '../data/oceanCurrents';

function FlowLine({ path, type }) {
  const positions = useMemo(
    () => path.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, 0)),
    [path],
  );

  const baseColor = type === 'warm' ? '#ff6b35' : '#4da6ff';

  const arrowMaterial = useMemo(
    () =>
      new PolylineArrowMaterialProperty(
        new CallbackProperty((time) => {
          const pulse = 0.3 + 0.2 * Math.sin(time.secondsOfDay * 2.0 + positions.length * 0.1);
          return Color.fromCssColorString(baseColor).withAlpha(pulse);
        }, false),
      ),
    [baseColor, positions.length],
  );

  return (
    <Entity>
      <PolylineGraphics
        positions={positions}
        width={2}
        material={arrowMaterial}
        clampToGround={true}
        distanceDisplayCondition={new DistanceDisplayCondition(0, 25000000)}
        translucencyByDistance={new NearFarScalar(3000000, 1.0, 25000000, 0.08)}
      />
    </Entity>
  );
}

export default function OceanCurrents() {
  return (
    <>
      {oceanCurrents.map((current, i) => (
        <FlowLine key={i} path={current.path} type={current.type} />
      ))}
    </>
  );
}

