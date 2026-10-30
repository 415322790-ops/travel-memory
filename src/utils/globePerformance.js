const DEBUG_GLOBE_PERF = import.meta.env.DEV
  && import.meta.env.VITE_DEBUG_GLOBE_PERF === 'true';

const metrics = {
  globeMarkersRenders: 0,
  cityAreaGlowRenders: 0,
  loadedCityLayers: 0,
  animatedLayers: 0,
  hoveredCityId: null,
  previousHoveredCityId: null,
  lastHoverAt: 0,
  hoverCount: 0,
};

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function readViewerStats(viewer) {
  return {
    entityCount: viewer?.entities?.values?.length || 0,
    dataSourceCount: viewer?.dataSources?.length || 0,
    requestRenderMode: Boolean(viewer?.scene?.requestRenderMode),
    maximumRenderTimeChange: viewer?.scene?.maximumRenderTimeChange ?? null,
  };
}

function snapshot(viewer, extra = {}) {
  return {
    ...readViewerStats(viewer),
    loadedCityLayers: metrics.loadedCityLayers,
    animatedLayers: metrics.animatedLayers,
    hoveredCityId: metrics.hoveredCityId,
    previousHoveredCityId: metrics.previousHoveredCityId,
    globeMarkersRenders: metrics.globeMarkersRenders,
    cityAreaGlowRenders: metrics.cityAreaGlowRenders,
    ...extra,
  };
}

export function isGlobePerfDebugEnabled() {
  return DEBUG_GLOBE_PERF;
}

export function markGlobeRender(component) {
  if (!DEBUG_GLOBE_PERF) return;
  if (component === 'GlobeMarkers') metrics.globeMarkersRenders += 1;
  if (component === 'CityAreaGlow') metrics.cityAreaGlowRenders += 1;
}

export function setGlobePerfState(nextState = {}) {
  if (!DEBUG_GLOBE_PERF) return;
  Object.assign(metrics, nextState);
}

export function reportGlobeHover(viewer, data = {}) {
  if (!DEBUG_GLOBE_PERF) return;
  metrics.hoverCount += 1;
  metrics.lastHoverAt = now();
  setGlobePerfState({
    hoveredCityId: data.hoveredCityId ?? null,
    previousHoveredCityId: data.previousHoveredCityId ?? null,
    animatedLayers: data.animatedLayers ?? metrics.animatedLayers,
  });
  console.info('[GlobePerf]', JSON.stringify(snapshot(viewer, {
    event: 'hover',
    hoverCount: metrics.hoverCount,
    ...data,
  })));
}

export function attachGlobePerf(viewer) {
  if (!DEBUG_GLOBE_PERF || !viewer?.scene?.postRender) return undefined;

  let lastFrameAt = now();
  let reportStartedAt = lastFrameAt;
  let frameCount = 0;
  let frameTimeTotal = 0;
  let frameTimeMax = 0;

  const onPostRender = () => {
    const frameAt = now();
    const frameTime = Math.max(0, frameAt - lastFrameAt);
    lastFrameAt = frameAt;
    frameCount += 1;
    frameTimeTotal += frameTime;
    frameTimeMax = Math.max(frameTimeMax, frameTime);

    if (frameAt - reportStartedAt < 1000) return;

    const elapsed = frameAt - reportStartedAt;
    console.info('[GlobePerf]', JSON.stringify(snapshot(viewer, {
      event: 'frame-summary',
      fps: Number((frameCount * 1000 / elapsed).toFixed(1)),
      frameMs: Number((frameTimeTotal / Math.max(1, frameCount)).toFixed(2)),
      maxFrameMs: Number(frameTimeMax.toFixed(2)),
      sampleMs: Number(elapsed.toFixed(0)),
    })));

    reportStartedAt = frameAt;
    frameCount = 0;
    frameTimeTotal = 0;
    frameTimeMax = 0;
  };

  viewer.scene.postRender.addEventListener(onPostRender);
  console.info('[GlobePerf]', JSON.stringify(snapshot(viewer, {
    event: 'viewer',
    ...readViewerStats(viewer),
  })));

  return () => viewer.scene.postRender.removeEventListener(onPostRender);
}
