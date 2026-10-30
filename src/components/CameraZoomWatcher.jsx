import { useEffect } from 'react';
import { useCesium } from 'resium';
import { Cartesian3 } from 'cesium';

const FADE_START_RATIO = 0.995;
const FADE_END_RATIO = 0.94;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function CameraZoomWatcher() {
  const { viewer } = useCesium();

  useEffect(() => {
    if (!viewer) return undefined;

    const root = document.documentElement;
    let frameId = 0;
    let lastOpacity = -1;

    const initialDistance = Cartesian3.magnitude(viewer.camera.position);
    const fadeStartDistance = initialDistance * FADE_START_RATIO;
    const fadeEndDistance = initialDistance * FADE_END_RATIO;

    const renderTitleState = () => {
      frameId = 0;
      const height = Cartesian3.magnitude(viewer.camera.position);
      const fadeProgress = clamp(
        (fadeStartDistance - height) / (fadeStartDistance - fadeEndDistance),
        0,
        1
      );
      const opacity = 1 - fadeProgress;

      if (lastOpacity >= 0 && Math.abs(opacity - lastOpacity) < 0.002) return;
      lastOpacity = opacity;

      root.style.setProperty('--hero-title-opacity', opacity.toFixed(3));
      root.style.setProperty('--hero-ui-opacity', opacity.toFixed(3));
      root.style.setProperty('--hero-title-x', (-20 * fadeProgress).toFixed(2) + 'px');
      root.style.setProperty('--hero-title-scale', (1 - 0.03 * fadeProgress).toFixed(3));
    };

    const scheduleUpdate = () => {
      if (!frameId) frameId = requestAnimationFrame(renderTitleState);
    };

    viewer.camera.changed.addEventListener(scheduleUpdate);
    scheduleUpdate();

    return () => {
      viewer.camera.changed.removeEventListener(scheduleUpdate);
      if (frameId) cancelAnimationFrame(frameId);
      root.style.setProperty('--hero-title-opacity', '1');
      root.style.setProperty('--hero-ui-opacity', '1');
      root.style.setProperty('--hero-title-x', '0px');
      root.style.setProperty('--hero-title-scale', '1');
    };
  }, [viewer]);

  return null;
}