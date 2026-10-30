import { useEffect, useRef } from 'react';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function drawBlob(ctx, x, y, radius, colorStops) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  colorStops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export default function AtmosphereLayer({ mode = 'journey' }) {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d', { alpha: true });
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    const particles = Array.from({ length: mode === 'gallery' ? 42 : 68 }, (_, i) => ({
      seed: i * 97.13,
      x: (Math.sin(i * 12.989) * 43758.5453) % 1,
      y: (Math.sin(i * 78.233) * 24531.173) % 1,
      size: 0.6 + ((i * 17) % 9) * 0.18,
      speed: 0.18 + ((i * 13) % 7) * 0.045,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onPointerMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.tx = (event.clientX - rect.left) / Math.max(rect.width, 1);
      mouseRef.current.ty = (event.clientY - rect.top) / Math.max(rect.height, 1);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const render = (timeMs) => {
      const time = timeMs * 0.001;
      const mouse = mouseRef.current;
      mouse.x = lerp(mouse.x, mouse.tx, 0.035);
      mouse.y = lerp(mouse.y, mouse.ty, 0.035);

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';

      const warmX = width * (0.2 + mouse.x * 0.46 + Math.sin(time * 0.12) * 0.04);
      const warmY = height * (0.18 + mouse.y * 0.22 + Math.cos(time * 0.1) * 0.04);
      const coolX = width * (0.78 - mouse.x * 0.25 + Math.cos(time * 0.09) * 0.05);
      const coolY = height * (0.72 - mouse.y * 0.18 + Math.sin(time * 0.11) * 0.05);

      drawBlob(ctx, warmX, warmY, Math.max(width, height) * 0.42, [
        [0, 'rgba(255, 133, 57, 0.34)'],
        [0.36, 'rgba(255, 133, 57, 0.12)'],
        [1, 'rgba(255, 133, 57, 0)'],
      ]);
      drawBlob(ctx, coolX, coolY, Math.max(width, height) * 0.34, [
        [0, 'rgba(45, 212, 168, 0.18)'],
        [0.42, 'rgba(45, 212, 168, 0.07)'],
        [1, 'rgba(45, 212, 168, 0)'],
      ]);

      ctx.globalCompositeOperation = 'screen';
      for (let band = 0; band < 3; band += 1) {
        const y = height * (0.24 + band * 0.22) + Math.sin(time * 0.32 + band) * 28;
        const gradient = ctx.createLinearGradient(0, y - 90, width, y + 90);
        gradient.addColorStop(0, 'rgba(255, 133, 57, 0)');
        gradient.addColorStop(0.42, `rgba(255, 133, 57, ${0.026 + band * 0.01})`);
        gradient.addColorStop(0.56, `rgba(45, 212, 168, ${0.018 + band * 0.006})`);
        gradient.addColorStop(1, 'rgba(255, 133, 57, 0)');
        ctx.save();
        ctx.translate(width / 2, y);
        ctx.rotate(-0.16 + Math.sin(time * 0.08 + band) * 0.03);
        ctx.fillStyle = gradient;
        ctx.fillRect(-width, -36, width * 2, 72);
        ctx.restore();
      }

      particles.forEach((particle, index) => {
        const drift = reduceMotion ? 0 : time * particle.speed;
        const x = ((particle.x + Math.sin(drift + particle.seed) * 0.035 + 1) % 1) * width;
        const y = ((particle.y + drift * 0.018 + Math.cos(drift * 0.8 + particle.seed) * 0.025 + 1) % 1) * height;
        const alpha = 0.08 + 0.06 * Math.sin(time * 0.9 + index);
        ctx.fillStyle = index % 5 === 0 ? `rgba(255, 133, 57, ${alpha})` : `rgba(255, 246, 235, ${alpha * 0.75})`;
        ctx.beginPath();
        ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });

      if (!reduceMotion) raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [mode]);

  return (
    <div className={`atmosphere-layer atmosphere-${mode}`} aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="atmosphere-grid" />
      <div className="atmosphere-noise" />
      <div className="atmosphere-scan" />
    </div>
  );
}
