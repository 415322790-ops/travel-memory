import { Entity, EllipsoidGraphics, LabelGraphics } from 'resium';
import { Cartesian2, Cartesian3, Color, VerticalOrigin, ImageMaterialProperty } from 'cesium';

// Generate Sun surface texture (just the surface pattern, no 3D shading)
function createSunSurface() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  // Base orange
  const base = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  base.addColorStop(0, '#ffcc30');
  base.addColorStop(1, '#ee6600');
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Turbulent surface spots
  for (let i = 0; i < 30; i++) {
    const sx = cx + (Math.random() - 0.5) * r * 1.6;
    const sy = cy + (Math.random() - 0.5) * r * 1.6;
    const sr = r * (0.05 + Math.random() * 0.15);
    const spot = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    spot.addColorStop(0, '#fff5b0');
    spot.addColorStop(0.5, '#ffaa20');
    spot.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toDataURL();
}

const SUN_SURFACE = createSunSurface();
const SUN_RADIUS = 2000000; // 2 million meters

export default function SolarSystem() {
  return (
    <>
      {/* Core — bright white-hot sphere */}
      <Entity position={Cartesian3.ZERO}>
        <EllipsoidGraphics
          radii={new Cartesian3(SUN_RADIUS * 0.3, SUN_RADIUS * 0.3, SUN_RADIUS * 0.3)}
          material={Color.fromCssColorString('#fffde0')}
        />
      </Entity>

      {/* Surface — textured 3D ellipsoid with the surface pattern */}
      <Entity position={Cartesian3.ZERO}>
        <EllipsoidGraphics
          radii={new Cartesian3(SUN_RADIUS * 0.65, SUN_RADIUS * 0.65, SUN_RADIUS * 0.65)}
          material={new ImageMaterialProperty({
            image: SUN_SURFACE,
            transparent: false,
          })}
        />
      </Entity>

      {/* Inner corona — warm transparent glow layer */}
      <Entity position={Cartesian3.ZERO}>
        <EllipsoidGraphics
          radii={new Cartesian3(SUN_RADIUS * 0.85, SUN_RADIUS * 0.85, SUN_RADIUS * 0.85)}
          material={Color.fromCssColorString('#ffaa20').withAlpha(0.5)}
        />
      </Entity>

      {/* Outer corona — larger, more transparent */}
      <Entity position={Cartesian3.ZERO}>
        <EllipsoidGraphics
          radii={new Cartesian3(SUN_RADIUS * 1.15, SUN_RADIUS * 1.15, SUN_RADIUS * 1.15)}
          material={Color.fromCssColorString('#ff8800').withAlpha(0.15)}
        />
      </Entity>

      {/* Label */}
      <Entity position={Cartesian3.ZERO}>
        <LabelGraphics
          text="太阳"
          font='600 16px "Microsoft YaHei", sans-serif'
          fillColor={Color.WHITE.withAlpha(0.8)}
          outlineColor={Color.BLACK.withAlpha(0.5)}
          outlineWidth={3}
          verticalOrigin={VerticalOrigin.TOP}
          pixelOffset={new Cartesian2(0, SUN_RADIUS * 1.2 / 50000)}
        />
      </Entity>
    </>
  );
}

