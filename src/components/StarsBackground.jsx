import { useMemo } from 'react';
import { Entity, PointGraphics } from 'resium';
import { Cartesian3, Color } from 'cesium';

// One sparse, repeatable star field; no twinkle or independent motion.
function generateStars(count = 180, radius = 50000000) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    // Fibonacci distribution avoids clusters competing with the city markers.
    const phi = Math.acos(1 - 2 * (i + 0.5) / count);
    const theta = i * Math.PI * (3 - Math.sqrt(5));
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    const brightness = 0.12 + (i % 7) * 0.018;
    stars.push({ position: new Cartesian3(x, y, z), brightness });
  }
  return stars;
}

export default function StarsBackground() {
  const stars = useMemo(() => generateStars(), []);

  return (
    <>
      {stars.map((star, i) => (
        <Entity key={i} position={star.position}>
          <PointGraphics
            pixelSize={1 + (i % 3) * 0.15}
            color={Color.fromCssColorString('#AEBBC5').withAlpha(star.brightness)}
          />
        </Entity>
      ))}
    </>
  );
}
