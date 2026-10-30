// Generate premium glass-morphism marker icons (like iPhone floating ball)
// Each returns a canvas dataURL for use with Cesium BillboardGraphics

function drawGlassBall(ctx, size, color, alpha = 1) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  // Outer glow ring
  const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r + 2);
  glow.addColorStop(0, `rgba(${color},0)`);
  glow.addColorStop(0.75, `rgba(${color},${0.15 * alpha})`);
  glow.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
  ctx.fill();

  // Main glass ball with 3D radial gradient
  const bodyGrad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.05, cx, cy, r);
  bodyGrad.addColorStop(0, `rgba(255,255,255,${0.95 * alpha})`);
  bodyGrad.addColorStop(0.25, `rgba(${color},${0.7 * alpha})`);
  bodyGrad.addColorStop(0.6, `rgba(${color},${0.5 * alpha})`);
  bodyGrad.addColorStop(1, `rgba(${color},${0.15 * alpha})`);

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Subtle border ring
  ctx.strokeStyle = `rgba(255,255,255,${0.35 * alpha})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
  ctx.stroke();

  // Inner highlight speck (top-left reflection)
  const speck = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.3, 0, cx - r * 0.28, cy - r * 0.3, r * 0.25);
  speck.addColorStop(0, `rgba(255,255,255,${0.9 * alpha})`);
  speck.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = speck;
  ctx.beginPath();
  ctx.arc(cx - r * 0.28, cy - r * 0.3, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

// Visited city marker — teal glass ball
export function createVisitedIcon() {
  const size = 40;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawGlassBall(ctx, size, '78,210,200', 1);
  return canvas.toDataURL();
}

// Selected city marker — coral glass ball (slightly larger)
export function createSelectedIcon() {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawGlassBall(ctx, size, '255,107,107', 1);
  return canvas.toDataURL();
}

// Unvisited tier city — subtle white glass dot
export function createUnvisitedIcon(tier) {
  const size = tier === 1 ? 26 : tier === 2 ? 20 : 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;
  const alpha = tier === 1 ? 0.7 : tier === 2 ? 0.5 : 0.35;

  const bodyGrad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, 0, cx, cy, r);
  bodyGrad.addColorStop(0, `rgba(255,255,255,${0.85 * alpha})`);
  bodyGrad.addColorStop(0.5, `rgba(255,255,255,${0.5 * alpha})`);
  bodyGrad.addColorStop(1, `rgba(255,255,255,${0.1 * alpha})`);

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255,255,255,${0.25 * alpha})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
  ctx.stroke();

  const speck = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.3, 0, cx - r * 0.28, cy - r * 0.3, r * 0.2);
  speck.addColorStop(0, `rgba(255,255,255,${0.8 * alpha})`);
  speck.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = speck;
  ctx.beginPath();
  ctx.arc(cx - r * 0.28, cy - r * 0.3, r * 0.2, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL();
}

// Pre-render icons once
export const ICON_VISITED = createVisitedIcon();
export const ICON_SELECTED = createSelectedIcon();
export const ICON_TIER1 = createUnvisitedIcon(1);
export const ICON_TIER2 = createUnvisitedIcon(2);
export const ICON_TIER3 = createUnvisitedIcon(3);
