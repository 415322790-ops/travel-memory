// Premium planet textures — inspired by NASA / Solar System Scope aesthetics

const CACHE = {};

function createCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function drawSun(canvas) {
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const ctx = canvas.getContext('2d');

  // Outer corona — massive warm glow
  const corona = ctx.createRadialGradient(cx, cy, r * 0.75, cx, cy, r + 10);
  corona.addColorStop(0, 'rgba(255,200,60,0)');
  corona.addColorStop(0.3, 'rgba(255,160,30,0.1)');
  corona.addColorStop(0.6, 'rgba(255,120,10,0.25)');
  corona.addColorStop(0.85, 'rgba(200,80,5,0.15)');
  corona.addColorStop(1, 'rgba(100,30,0,0)');
  ctx.fillStyle = corona;
  ctx.fillRect(0, 0, size, size);

  // Surface — turbulent orange-yellow layers
  for (let i = 0; i < 5; i++) {
    const layer = ctx.createRadialGradient(
      cx + (Math.random() - 0.5) * r * 0.4,
      cy + (Math.random() - 0.5) * r * 0.4,
      r * (0.05 + Math.random() * 0.2),
      cx, cy, r * (0.85 + Math.random() * 0.15),
    );
    const colors = ['#ffaa20', '#ff8800', '#ff6600', '#ff9930', '#ffcc40'];
    layer.addColorStop(0, colors[i]);
    layer.addColorStop(0.5, colors[(i + 1) % 5]);
    layer.addColorStop(1, '#cc4400');
    ctx.fillStyle = layer;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (0.85 + Math.random() * 0.15), 0, Math.PI * 2);
    ctx.fill();
  }

  // Bright center
  const center = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.5);
  center.addColorStop(0, '#fffde0');
  center.addColorStop(0.3, '#fff5b0');
  center.addColorStop(0.7, '#ffcc40');
  center.addColorStop(1, '#ff8800');
  ctx.fillStyle = center;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Subtle surface structure
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const rr = r * (0.4 + Math.random() * 0.3);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * rr * 0.3, cy + Math.sin(angle) * rr * 0.3, rr * 0.25, 0, Math.PI * 2);
    ctx.stroke();
  }

  return canvas.toDataURL();
}

function drawPlanet(canvas, config) {
  const { baseColor, highlightColor, bands, hasRings, ringColor, spots, atmosphereColor } = config;
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;
  const ctx = canvas.getContext('2d');

  // Atmosphere glow
  if (atmosphereColor) {
    const atmo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r + 3);
    atmo.addColorStop(0, 'rgba(0,0,0,0)');
    atmo.addColorStop(0.85, atmosphereColor);
    atmo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = atmo;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Base body
  const body = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, 0, cx, cy, r);
  body.addColorStop(0, highlightColor);
  body.addColorStop(0.45, baseColor);
  body.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Horizontal bands (Jupiter, Saturn)
  if (bands) {
    for (let i = 0; i < bands.length; i++) {
      const { y, color, width, alpha } = bands[i];
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha || 0.35;
      ctx.beginPath();
      const bandY = cy - r + y * r * 2 + width / 2;
      const bandWidth = Math.sqrt(r * r - (bandY - cy) * (bandY - cy)) * 2;
      ctx.moveTo(cx - bandWidth, bandY);
      ctx.lineTo(cx + bandWidth, bandY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Surface spots (for gas giants)
  if (spots) {
    for (const spot of spots) {
      const { sx, sy, sr, color } = spot;
      const sxAbs = cx - r + sx * r * 2;
      const syAbs = cy - r + sy * r * 2;
      const spotGrad = ctx.createRadialGradient(sxAbs, syAbs, 0, sxAbs, syAbs, sr * r);
      spotGrad.addColorStop(0, color);
      spotGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = spotGrad;
      ctx.beginPath();
      ctx.arc(sxAbs, syAbs, sr * r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Rings (Saturn)
  if (hasRings) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.3);
    ctx.rotate(-0.3);

    // Multiple ring bands
    const ringBands = [
      { inner: 1.05, outer: 1.25, color: ringColor },
      { inner: 1.25, outer: 1.45, color: 'rgba(210,190,140,0.5)' },
      { inner: 1.45, outer: 1.6, color: 'rgba(200,180,130,0.3)' },
    ];

    for (const ring of ringBands) {
      const grad = ctx.createRadialGradient(0, 0, ring.inner * r, 0, 0, ring.outer * r);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.3, ring.color);
      grad.addColorStop(0.7, ring.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, ring.outer * r, 0, Math.PI * 2);
      ctx.arc(0, 0, ring.inner * r, 0, Math.PI * 2, true);
      ctx.fill();
    }

    ctx.restore();
  }

  // Edge highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  return canvas.toDataURL();
}

function getIcon(name) {
  if (CACHE[name]) return CACHE[name];

  const configs = {
    sun: () => drawSun(createCanvas(160)),
    mercury: () => drawPlanet(createCanvas(22), { baseColor: '#9e9e9e', highlightColor: '#d4d4d4', atmosphereColor: 'rgba(180,180,180,0.08)' }),
    venus: () => drawPlanet(createCanvas(36), { baseColor: '#e8cda0', highlightColor: '#fce8d0', atmosphereColor: 'rgba(240,220,180,0.2)' }),
    earth: () => drawPlanet(createCanvas(42), { baseColor: '#2255aa', highlightColor: '#88bbee', atmosphereColor: 'rgba(120,180,240,0.25)' }),
    mars: () => drawPlanet(createCanvas(30), { baseColor: '#c1440e', highlightColor: '#e8784a', atmosphereColor: 'rgba(200,100,40,0.1)' }),
    jupiter: () => drawPlanet(createCanvas(80), {
      baseColor: '#c9a87c', highlightColor: '#f0dcc0',
      bands: [
        { y: 0.12, color: '#c49a5e', width: 8, alpha: 0.5 },
        { y: 0.25, color: '#d4b06c', width: 6, alpha: 0.4 },
        { y: 0.40, color: '#b08040', width: 10, alpha: 0.5 },
        { y: 0.55, color: '#d4b06c', width: 5, alpha: 0.35 },
        { y: 0.68, color: '#c49a5e', width: 8, alpha: 0.45 },
        { y: 0.80, color: '#b08040', width: 6, alpha: 0.4 },
      ],
      spots: [{ sx: 0.55, sy: 0.3, sr: 0.18, color: '#cc6644' }],
    }),
    saturn: () => drawPlanet(createCanvas(76), {
      baseColor: '#e0c878', highlightColor: '#faf0d0',
      hasRings: true, ringColor: 'rgba(220,195,130,0.7)',
      bands: [
        { y: 0.2, color: '#dcc470', width: 4, alpha: 0.3 },
        { y: 0.5, color: '#dcc470', width: 5, alpha: 0.35 },
        { y: 0.75, color: '#dcc470', width: 3, alpha: 0.3 },
      ],
    }),
    uranus: () => drawPlanet(createCanvas(46), { baseColor: '#5eb8c8', highlightColor: '#b0e8f0', atmosphereColor: 'rgba(160,220,240,0.2)' }),
    neptune: () => drawPlanet(createCanvas(44), { baseColor: '#3344aa', highlightColor: '#6678ee', atmosphereColor: 'rgba(80,100,220,0.2)' }),
    moon: () => drawPlanet(createCanvas(14), { baseColor: '#b8b8b8', highlightColor: '#e8e8e8' }),
  };

  const fn = configs[name];
  if (!fn) return null;
  CACHE[name] = fn();
  return CACHE[name];
}

export function getPlanetIcon(name) {
  return getIcon(name);
}
