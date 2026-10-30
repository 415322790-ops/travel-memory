import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useCesium } from 'resium';
import {
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  CustomDataSource,
  Entity,
  JulianDate,
  PolygonGraphics,
  PolygonHierarchy,
  PolylineGraphics,
} from 'cesium';
import { useTravel } from '../context/TravelContext';
import { getCityBoundaryConfig } from '../config/cityBoundaryConfig';
import {
  markGlobeRender,
  reportGlobeHover,
  setGlobePerfState,
} from '../utils/globePerformance';

const ENABLE_PROVISIONAL_CITY_BOUNDARIES = import.meta.env.VITE_ENABLE_PROVISIONAL_CITY_BOUNDARIES === 'true';
const SHOW_CITY_BOUNDARY_ALIGNMENT_DEBUG = import.meta.env.DEV
  && import.meta.env.VITE_SHOW_CITY_BOUNDARY_ALIGNMENT_DEBUG === 'true';

const DEFAULT_LINE_COLOR = Color.fromCssColorString('#BDB29C');
const DEFAULT_GLOW_COLOR = Color.fromCssColorString('#C3B9A6');
const DEBUG_LINE_COLOR = Color.MAGENTA;
const DEBUG_FILL_COLOR = Color.YELLOW;
const DEBUG_FILL_ALPHA = 0.38;
const TRANSITION_MS = 280;

const CITY_STATUS = {
  DEFAULT: 'default',
  HOVERED: 'hovered',
  SELECTED: 'selected',
  DIMMED: 'dimmed',
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function getGeoJson(payload) {
  return payload?.default ?? payload;
}

function getFeatures(payload) {
  const data = getGeoJson(payload);
  if (!data) return [];
  if (data.type === 'Feature') return [data];
  if (data.type === 'FeatureCollection') {
    return Array.isArray(data.features) ? data.features : [];
  }
  if (data.type === 'Polygon' || data.type === 'MultiPolygon') {
    return [{ type: 'Feature', properties: {}, geometry: data }];
  }
  return [];
}

function getPolygonGroups(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function normalizeRing(rawRing) {
  if (!Array.isArray(rawRing)) return [];
  const ring = rawRing
    .filter((point) => (
      Array.isArray(point)
      && Number.isFinite(Number(point[0]))
      && Number.isFinite(Number(point[1]))
    ))
    .map(([longitude, latitude]) => [Number(longitude), Number(latitude)]);

  if (ring.length > 1) {
    const [firstLongitude, firstLatitude] = ring[0];
    const [lastLongitude, lastLatitude] = ring[ring.length - 1];
    if (firstLongitude === lastLongitude && firstLatitude === lastLatitude) {
      ring.pop();
    }
  }

  return ring.length >= 3 ? ring : [];
}

function ringToPositions(ring) {
  return Cartesian3.fromDegreesArray(ring.flatMap(([longitude, latitude]) => [
    longitude,
    latitude,
  ]));
}

function parseGeoJson(payload) {
  const features = getFeatures(payload);
  const polygons = [];
  let holeCount = 0;

  features.forEach((feature) => {
    getPolygonGroups(feature.geometry).forEach((rawPolygon) => {
      const rings = rawPolygon.map(normalizeRing).filter((ring) => ring.length >= 3);
      const outerRing = rings[0];
      if (!outerRing) return;

      const holes = rings.slice(1);
      holeCount += holes.length;
      polygons.push({
        outerRing,
        holes,
        hierarchy: new PolygonHierarchy(
          ringToPositions(outerRing),
          holes.map((ring) => new PolygonHierarchy(ringToPositions(ring))),
        ),
        rings: [outerRing, ...holes].map(ringToPositions),
      });
    });
  });

  return {
    features,
    polygons,
    polygonCount: polygons.length,
    validOuterRingCount: polygons.length,
    holeCount,
  };
}

function getCityId(location) {
  return String(location?.cityId || location?.id || '').trim();
}

function normalizeCityId(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isSameCityId(left, right) {
  const leftId = normalizeCityId(left);
  const rightId = normalizeCityId(right);
  return Boolean(leftId && rightId && leftId === rightId);
}

function getCityRecords(locations) {
  const byCityId = new Map();

  (Array.isArray(locations) ? locations : []).forEach((location) => {
    const cityId = getCityId(location);
    if (!cityId || byCityId.has(cityId)) return;
    byCityId.set(cityId, { cityId, location });
  });

  return Array.from(byCityId.values());
}

function resolveCityId(locations, value) {
  if (value === null || value === undefined || value === '') return null;
  const rawValue = String(value).trim();
  const normalizedValue = normalizeCityId(rawValue);
  const match = getCityRecords(locations).find(({ cityId, location }) => (
    [cityId, location?.id, location?.cityId]
      .some((candidate) => normalizeCityId(candidate) === normalizedValue)
  ));
  return match?.cityId || rawValue;
}

function getStatus(cityId, selectedCityId, hoveredCityId, footprintMode) {
  if (isSameCityId(selectedCityId, cityId)) return CITY_STATUS.SELECTED;
  if (isSameCityId(hoveredCityId, cityId)) return CITY_STATUS.HOVERED;
  // Footprint mode intentionally highlights every visited city. This is
  // separate from hover, which must always match one canonical city id.
  if (footprintMode) return CITY_STATUS.SELECTED;
  if (selectedCityId) return CITY_STATUS.DIMMED;
  return CITY_STATUS.DEFAULT;
}

function getStyle(status, debugMode) {
  const active = status === CITY_STATUS.HOVERED || status === CITY_STATUS.SELECTED;
  if (debugMode && active) {
    return {
      lineColor: DEBUG_LINE_COLOR, lineAlpha: 1, lineWidth: 4,
      fillColor: DEBUG_FILL_COLOR, fillAlpha: DEBUG_FILL_ALPHA,
    };
  }
  const selected = status === CITY_STATUS.SELECTED;
  return {
    lineColor: DEFAULT_LINE_COLOR,
    lineAlpha: active ? (selected ? 0.36 : 0.30) : 0,
    lineWidth: 1,
    fillColor: DEFAULT_GLOW_COLOR,
    fillAlpha: active ? (selected ? 0.055 : 0.045) : 0,
  };
}

function colorWithAlpha(color, alpha) {
  return color.withAlpha(clamp(alpha, 0, 1));
}

function updateMaterialColor(materialProperty, color) {
  const colorProperty = materialProperty?.color;
  if (colorProperty?.setValue) {
    colorProperty.setValue(color);
    return;
  }
  if (materialProperty) materialProperty.color = new ConstantProperty(color);
}

function updateGraphicProperty(graphic, key, value) {
  if (!graphic) return;
  const property = graphic[key];
  if (property?.setValue) {
    property.setValue(value);
    return;
  }
  graphic[key] = new ConstantProperty(value);
}

function applyLayerStyle(layer, style) {
  layer.boundaryEntities.forEach((entity) => {
    updateGraphicProperty(entity.polyline, 'width', style.lineWidth);
    updateMaterialColor(
      layer.materials.get(entity.id),
      colorWithAlpha(style.lineColor, style.lineAlpha),
    );
  });

  layer.fillEntities.forEach((entity) => {
    updateMaterialColor(
      layer.materials.get(entity.id),
      colorWithAlpha(style.fillColor, style.fillAlpha),
    );
  });

  layer.currentStyle = style;
  layer.phase = style.lineAlpha > 0.01 || style.fillAlpha > 0.01 ? 'visible' : 'idle';
}

function cancelLayerAnimation(layer) {
  if (!layer) return;
  layer.animationToken += 1;
  if (layer.animationFrame) cancelAnimationFrame(layer.animationFrame);
  layer.animationFrame = null;
}

function animateLayer(layer, status, reduceMotion, debugMode) {
  if (!layer) return;

  cancelLayerAnimation(layer);
  const targetStyle = getStyle(status, debugMode);
  const animationToken = layer.animationToken;
  if (reduceMotion || debugMode) {
    applyLayerStyle(layer, targetStyle);
    return;
  }

  const fromStyle = layer.currentStyle || getStyle(CITY_STATUS.DEFAULT, false);
  const startTime = getNow() + (status === CITY_STATUS.HOVERED ? 80 : 0);

  const frame = () => {
    if (layer.animationToken !== animationToken) return;
    const progress = clamp((getNow() - startTime) / TRANSITION_MS, 0, 1);
    const eased = progress * (2 - progress);
    applyLayerStyle(layer, {
      lineColor: targetStyle.lineColor,
      lineAlpha: lerp(fromStyle.lineAlpha, targetStyle.lineAlpha, eased),
      lineWidth: lerp(fromStyle.lineWidth, targetStyle.lineWidth, eased),
      fillColor: targetStyle.fillColor,
      fillAlpha: lerp(fromStyle.fillAlpha, targetStyle.fillAlpha, eased),
    });

    if (progress < 1) {
      layer.animationFrame = requestAnimationFrame(frame);
    } else {
      layer.animationFrame = null;
      applyLayerStyle(layer, targetStyle);
    }
  };

  layer.animationFrame = requestAnimationFrame(frame);
}

function addPolygonEntity(dataSource, id, polygon, color) {
  const entity = new Entity({ id, show: true });
  const material = new ColorMaterialProperty(color);
  entity.polygon = new PolygonGraphics({
    hierarchy: new ConstantProperty(polygon.hierarchy),
    material,
    show: new ConstantProperty(true),
    perPositionHeight: new ConstantProperty(false),
  });
  // Keep this layer idempotent if React StrictMode or a hot reload replays
  // the async loader before its previous data source has fully settled.
  dataSource.entities.removeById(id);
  dataSource.entities.add(entity);
  return { entity, material };
}

function addBoundaryEntity(dataSource, id, positions, color) {
  const entity = new Entity({ id, show: true });
  const material = new ColorMaterialProperty(color);
  entity.polyline = new PolylineGraphics({
    positions: new ConstantProperty([...positions, positions[0]]),
    width: new ConstantProperty(1.2),
    material,
    clampToGround: new ConstantProperty(true),
    show: new ConstantProperty(true),
  });
  dataSource.entities.removeById(id);
  dataSource.entities.add(entity);
  return { entity, material };
}

function createCityLayer(dataSource, config, parsed, debugMode) {
  const layer = {
    cityId: config.cityId,
    cityName: config.cityName,
    config,
    polygonCount: parsed.polygonCount,
    boundaryEntities: [],
    fillEntities: [],
    materials: new Map(),
    currentStyle: null,
    phase: 'loading',
    animationFrame: null,
    animationToken: 0,
  };

  parsed.polygons.forEach((polygon, polygonIndex) => {
    const fill = addPolygonEntity(
      dataSource,
      'city-glow-fill:' + config.cityId + ':' + polygonIndex,
      polygon,
      Color.TRANSPARENT,
    );
    layer.fillEntities.push(fill.entity);
    layer.materials.set(fill.entity.id, fill.material);

    polygon.rings.forEach((positions, ringIndex) => {
      const boundary = addBoundaryEntity(
        dataSource,
        'city-boundary:' + config.cityId + ':' + polygonIndex + ':' + ringIndex,
        positions,
        Color.TRANSPARENT,
      );
      layer.boundaryEntities.push(boundary.entity);
      layer.materials.set(boundary.entity.id, boundary.material);
    });
  });

  applyLayerStyle(layer, getStyle(CITY_STATUS.DEFAULT, debugMode));

  if (import.meta.env.DEV) {
    console.info('[CityAreaGlow] geometry parsed', {
      polygonCount: layer.polygonCount,
      validOuterRingCount: parsed.validOuterRingCount,
      holeCount: parsed.holeCount,
    });
    console.info('[CityAreaGlow] entities created', {
      polygonEntities: layer.fillEntities.length,
      outlineEntities: layer.boundaryEntities.length,
      dataSource: 'city-area-glow',
    });
  }

  return layer;
}

function removeCityLayer(runtime, cityId) {
  const layer = runtime.layerByCityId.get(cityId);
  if (!layer) return;

  cancelLayerAnimation(layer);
  [
    ...layer.boundaryEntities,
    ...layer.fillEntities,
  ].forEach((entity) => runtime.dataSource?.entities.removeById(entity.id));

  runtime.layers.delete(cityId);
  runtime.layerByCityId.delete(cityId);
}

function loadBoundary(config) {
  const cacheKey = config.cityId;
  if (!loadBoundary.cache) loadBoundary.cache = new Map();
  if (loadBoundary.cache.has(cacheKey)) return loadBoundary.cache.get(cacheKey);

  const promise = Promise.resolve()
    .then(() => config.boundaryLoader())
    .then((module) => module?.default ?? module);
  loadBoundary.cache.set(cacheKey, promise);
  return promise;
}

function getGraphicShow(graphic) {
  if (!graphic?.show) return null;
  if (typeof graphic.show.getValue === 'function') {
    return graphic.show.getValue(JulianDate.now());
  }
  return Boolean(graphic.show);
}

function getMarkerSnapshot(viewer, cityId) {
  const markerEntityId = 'city-marker:' + cityId;
  const entity = viewer?.entities?.getById(markerEntityId);
  return {
    markerEntityId,
    exists: Boolean(entity),
    entityShow: entity?.show ?? null,
    pointShow: getGraphicShow(entity?.point),
    billboardShow: getGraphicShow(entity?.billboard),
    labelShow: getGraphicShow(entity?.label),
  };
}

function logMarkerLifecycle(viewer, runtime, cityId, event, state) {
  if (!import.meta.env.DEV || !SHOW_CITY_BOUNDARY_ALIGNMENT_DEBUG || !cityId) return;

  const marker = getMarkerSnapshot(viewer, cityId);
  console.info('[CityAreaGlow] marker lifecycle', {
    event,
    ...marker,
    hoveredCityId: state.hoveredCityId,
    selectedId: state.selectedId,
    activeCityId: state.activeCityId,
    areaPhase: runtime.layers.get(cityId)?.phase || 'none',
    areaEntityCount: runtime.dataSource?.entities?.values?.length || 0,
  });
}

function logAlignmentDiagnostics(config, parsed) {
  if (!import.meta.env.DEV || !SHOW_CITY_BOUNDARY_ALIGNMENT_DEBUG) return;

  console.info('[CityAreaGlow] alignment', {
    cityId: config.cityId,
    cityName: config.cityName,
    featureCount: parsed.features.length,
    polygonCount: parsed.polygonCount,
    coordinateSystem: config.coordinateSystem,
    metadataOnly: true,
  });
}

function ensureCityLayer({
  runtime,
  city,
  setDiagnostic,
  bumpLayerVersion,
}) {
  if (!runtime.dataSource || runtime.layers.has(city.cityId) || runtime.pending.has(city.cityId)) return;

  runtime.pending.set(city.cityId, true);
  loadBoundary(city.config)
    .then((module) => {
      if (runtime.cityIds.has(city.cityId) === false) return;
      const geojson = getGeoJson(module);
      if (import.meta.env.DEV) {
        console.info('[CityAreaGlow] boundary loaded', {
          type: geojson?.type,
          geometryType: geojson?.geometry?.type ?? geojson?.features?.[0]?.geometry?.type,
          featureCount: Array.isArray(geojson?.features)
            ? geojson.features.length
            : geojson?.type === 'Feature'
              ? 1
              : 0,
        });
      }

      const parsed = parseGeoJson(geojson);
      if (!parsed.polygonCount) {
        throw new Error('City boundary contains no valid polygons');
      }

      const layer = createCityLayer(
        runtime.dataSource,
        city.config,
        parsed,
        SHOW_CITY_BOUNDARY_ALIGNMENT_DEBUG,
      );
      runtime.layers.set(city.cityId, layer);
      runtime.layerByCityId.set(city.cityId, layer);
      logAlignmentDiagnostics(city.config, parsed);
      bumpLayerVersion((value) => value + 1);

      const { selectedCityId, hoveredCityId, footprintMode, reduceMotion } = runtime.state;
      const status = getStatus(city.cityId, selectedCityId, hoveredCityId, footprintMode);
      animateLayer(layer, status, reduceMotion, SHOW_CITY_BOUNDARY_ALIGNMENT_DEBUG);
      setGlobePerfState({ loadedCityLayers: runtime.layerByCityId.size });
      setDiagnostic((current) => ({
        ...current,
        city: city.cityId,
        config: true,
        data: 'loaded',
        phase: layer.phase,
        polygons: layer.polygonCount,
        show: layer.phase === 'visible',
        opacity: layer.currentStyle?.lineAlpha || 0,
        entities: runtime.dataSource.entities.values.length,
      }));
    })
    .catch((error) => {
      console.error('[CityAreaGlow] boundary load failed', error);
      setDiagnostic((current) => ({
        ...current,
        city: city.cityId,
        config: true,
        data: 'error',
        phase: 'error',
        polygons: 0,
        show: false,
        opacity: 0,
        entities: runtime.dataSource?.entities?.values?.length || 0,
      }));
    })
    .finally(() => {
      runtime.pending.delete(city.cityId);
    });
}

export default function CityAreaGlow({ hoveredCityId }) {
  const { viewer } = useCesium();
  const { locations, selectedId, footprintMode } = useTravel();
  const reduceMotion = Boolean(useReducedMotion());
  markGlobeRender('CityAreaGlow');
  const runtimeRef = useRef({
    dataSource: null,
    layers: new Map(),
    layerByCityId: new Map(),
    pending: new Map(),
    cityIds: new Set(),
    state: {
      selectedCityId: null,
      hoveredCityId: null,
      footprintMode: false,
      reduceMotion: false,
    },
  });
  const [layerVersion, setLayerVersion] = useState(0);
  const [diagnostic, setDiagnostic] = useState({
    city: null,
    config: false,
    data: 'disabled',
    phase: 'none',
    polygons: 0,
    show: false,
    opacity: 0,
    entities: 0,
  });
  const previousTargetRef = useRef({
    hoveredCityId: null,
    selectedCityId: null,
    footprintMode: false,
  });

  const cityRecords = useMemo(() => getCityRecords(locations), [locations]);
  const configuredCities = useMemo(
    () => cityRecords
      .map((city) => ({
        ...city,
        config: getCityBoundaryConfig(city.cityId),
      }))
      .filter((city) => Boolean(city.config)),
    [cityRecords],
  );
  const selectedCityId = useMemo(
    () => resolveCityId(locations, selectedId),
    [locations, selectedId],
  );
  const resolvedHoveredCityId = useMemo(
    () => resolveCityId(locations, hoveredCityId),
    [locations, hoveredCityId],
  );
  const activeCityId = selectedCityId || resolvedHoveredCityId || null;
  const boundaryConfig = useMemo(
    () => (activeCityId ? getCityBoundaryConfig(activeCityId) : null),
    [activeCityId],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;

    console.info('[CityAreaGlow] env', {
      enabled: import.meta.env.VITE_ENABLE_PROVISIONAL_CITY_BOUNDARIES,
      alignmentDebug: import.meta.env.VITE_SHOW_CITY_BOUNDARY_ALIGNMENT_DEBUG,
      isDev: import.meta.env.DEV,
    });
    console.info('[CityAreaGlow] mounted');
    return () => {
      console.info('[CityAreaGlow] unmounted');
    };
  }, []);

  useEffect(() => {
    if (!viewer || !import.meta.env.DEV) return;
    const guangzhou = cityRecords.find((city) => (
      city.cityId === 'guangzhou' || city.location?.name === '广州'
    ));
    if (!guangzhou) return;
    console.info('[CityAreaGlow] Guangzhou marker identity', {
      markerId: guangzhou.cityId,
      cityName: guangzhou.location?.name,
    });
  }, [cityRecords, viewer]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info('[CityAreaGlow] target', {
      hoveredCityId: resolvedHoveredCityId,
      selectedId,
      activeCityId,
    });
    console.info('[CityAreaGlow] config match', {
      activeCityId,
      matched: Boolean(boundaryConfig),
      adcode: boundaryConfig?.adcode,
    });
  }, [activeCityId, boundaryConfig, resolvedHoveredCityId, selectedId]);

  useEffect(() => {
    if (!viewer || !ENABLE_PROVISIONAL_CITY_BOUNDARIES) return undefined;

    const runtime = runtimeRef.current;
    const dataSource = new CustomDataSource('city-area-glow');
    runtime.dataSource = dataSource;
    viewer.dataSources.add(dataSource);

    return () => {
      runtime.cityIds.clear();
      runtime.pending.clear();
      runtime.layers.forEach(cancelLayerAnimation);
      runtime.layers.clear();
      runtime.layerByCityId.clear();
      if (runtime.dataSource === dataSource) runtime.dataSource = null;
      viewer.dataSources.remove(dataSource, true);
    };
  }, [viewer]);

  useEffect(() => {
    runtimeRef.current.state = {
      ...runtimeRef.current.state,
      selectedCityId,
      hoveredCityId: resolvedHoveredCityId,
      footprintMode,
      reduceMotion,
    };
  }, [selectedCityId, resolvedHoveredCityId, footprintMode, reduceMotion]);

  useEffect(() => {
    if (!viewer || !ENABLE_PROVISIONAL_CITY_BOUNDARIES) return undefined;
    const runtime = runtimeRef.current;
    if (!runtime.dataSource) return undefined;

    runtime.cityIds = new Set(configuredCities.map((city) => city.cityId));
    Array.from(runtime.layers.keys()).forEach((cityId) => {
      if (!runtime.cityIds.has(cityId)) removeCityLayer(runtime, cityId);
    });

    configuredCities.forEach((city) => {
      ensureCityLayer({
        runtime,
        city,
        setDiagnostic,
        bumpLayerVersion: setLayerVersion,
      });
    });

    return undefined;
  }, [viewer, configuredCities]);

  useEffect(() => {
    if (!viewer || !ENABLE_PROVISIONAL_CITY_BOUNDARIES) return undefined;
    const runtime = runtimeRef.current;
    if (!runtime.dataSource) return undefined;

    const previous = previousTargetRef.current;
    const hoverChanged = previous.hoveredCityId !== resolvedHoveredCityId;
    const selectionChanged = previous.selectedCityId !== selectedCityId;
    const footprintChanged = previous.footprintMode !== footprintMode;
    const targetCityIds = new Set();

    if (selectionChanged || footprintChanged) {
      runtime.layerByCityId.forEach((layer) => targetCityIds.add(layer.cityId));
    } else if (hoverChanged && !footprintMode) {
      if (previous.hoveredCityId) targetCityIds.add(previous.hoveredCityId);
      if (resolvedHoveredCityId) targetCityIds.add(resolvedHoveredCityId);
    }

    if (previous.hoveredCityId !== resolvedHoveredCityId) {
      if (resolvedHoveredCityId) {
        logMarkerLifecycle(
          viewer,
          runtime,
          resolvedHoveredCityId,
          previous.hoveredCityId ? 'second enter' : 'enter',
          { hoveredCityId: resolvedHoveredCityId, selectedId, activeCityId },
        );
      } else if (previous.hoveredCityId) {
        logMarkerLifecycle(
          viewer,
          runtime,
          previous.hoveredCityId,
          'leave',
          { hoveredCityId: null, selectedId, activeCityId },
        );
      }
    }

    if (previous.selectedCityId !== selectedCityId) {
      logMarkerLifecycle(
        viewer,
        runtime,
        selectedCityId || previous.selectedCityId,
        selectedId ? 'selected' : 'selected cleared',
        { hoveredCityId: resolvedHoveredCityId, selectedId, activeCityId },
      );
    }

    if (
      import.meta.env.DEV
      && SHOW_CITY_BOUNDARY_ALIGNMENT_DEBUG
      && previous.hoveredCityId !== resolvedHoveredCityId
    ) {
      targetCityIds.forEach((cityId) => {
        const layer = runtime.layerByCityId.get(cityId);
        if (!layer) return;
        console.info('[CityHoverStyle]', JSON.stringify({
          hoveredCityId: resolvedHoveredCityId,
          cityId: layer.cityId,
          isHovered: isSameCityId(resolvedHoveredCityId, layer.cityId),
        }));
      });
    }

    let animatedLayerCount = 0;
    targetCityIds.forEach((cityId) => {
      const layer = runtime.layerByCityId.get(cityId);
      if (!layer) return;
      const previousStatus = getStatus(
        layer.cityId,
        previous.selectedCityId,
        previous.hoveredCityId,
        previous.footprintMode,
      );
      const nextStatus = getStatus(
        layer.cityId,
        selectedCityId,
        resolvedHoveredCityId,
        footprintMode,
      );
      if (previousStatus === nextStatus) return;
      animateLayer(layer, nextStatus, reduceMotion, SHOW_CITY_BOUNDARY_ALIGNMENT_DEBUG);
      animatedLayerCount += 1;
    });

    if (hoverChanged) {
      reportGlobeHover(viewer, {
        hoveredCityId: resolvedHoveredCityId,
        previousHoveredCityId: previous.hoveredCityId,
        loadedLayerCount: runtime.layerByCityId.size,
        animatedLayers: animatedLayerCount,
      });
    }
    setGlobePerfState({
      loadedCityLayers: runtime.layerByCityId.size,
      animatedLayers: animatedLayerCount,
    });

    previousTargetRef.current = {
      hoveredCityId: resolvedHoveredCityId,
      selectedCityId,
      footprintMode,
    };

    const activeLayer = activeCityId ? runtime.layerByCityId.get(activeCityId) : null;
    setDiagnostic((current) => ({
      ...current,
      city: activeCityId,
      config: Boolean(boundaryConfig),
      data: activeLayer ? 'loaded' : boundaryConfig ? 'loading' : 'not loaded',
      phase: activeLayer?.phase || (boundaryConfig ? 'loading' : 'none'),
      polygons: activeLayer?.polygonCount || 0,
      show: Boolean(activeLayer && activeLayer.phase === 'visible'),
      opacity: activeLayer?.currentStyle?.lineAlpha || 0,
      entities: runtime.dataSource.entities.values.length,
    }));

    return undefined;
  }, [
    viewer,
    activeCityId,
    boundaryConfig,
    reduceMotion,
    resolvedHoveredCityId,
    selectedId,
    selectedCityId,
    footprintMode,
    layerVersion,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV || !SHOW_CITY_BOUNDARY_ALIGNMENT_DEBUG) return;
    console.info('[CityAreaGlow] render state', {
      enabled: ENABLE_PROVISIONAL_CITY_BOUNDARIES,
      hasConfig: Boolean(boundaryConfig),
      hasGeometry: diagnostic.polygons > 0,
      show: diagnostic.show,
      opacity: diagnostic.opacity,
      phase: diagnostic.phase,
      entities: diagnostic.entities,
    });
  }, [boundaryConfig, diagnostic]);

  const diagnosticPanel = SHOW_CITY_BOUNDARY_ALIGNMENT_DEBUG && typeof document !== 'undefined'
    ? createPortal(
        <div
          style={{
            position: 'fixed',
            left: '16px',
            bottom: '16px',
            zIndex: 9999,
            padding: '8px 10px',
            color: '#F7F3EA',
            background: 'rgba(8, 7, 6, 0.82)',
            border: '1px solid rgba(231, 200, 146, 0.48)',
            borderRadius: '4px',
            font: '11px/1.5 monospace',
            pointerEvents: 'none',
          }}
        >
          City boundary: env {ENABLE_PROVISIONAL_CITY_BOUNDARIES ? 'on' : 'off'}
          {' | city '}{diagnostic.city || 'none'}
          {' | config '}{diagnostic.config ? 'matched' : 'missing'}
          {' | data '}{diagnostic.data}
          {' | polygons '}{diagnostic.polygons}
          {' | phase '}{diagnostic.phase}
          {' | entities '}{diagnostic.entities}
        </div>,
        document.body,
      )
    : null;

  return diagnosticPanel;
}

