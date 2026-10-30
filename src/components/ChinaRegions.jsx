import { useEffect, useRef, useMemo } from 'react';
import { useCesium } from 'resium';
import {
  Color, Cartesian3, PolygonHierarchy, DistanceDisplayCondition,
  NearFarScalar, PolygonGraphics, LabelGraphics, Entity,
} from 'cesium';
import { useTravel } from '../context/TravelContext';

function polygonHierarchyFromCoords(coords) {
  if (!coords || !coords[0]) return null;
  const outer = coords[0].map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, 0));
  const holes = coords.slice(1).map(ring =>
    ring.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, 0))
  );
  return new PolygonHierarchy(outer, holes.length ? holes : undefined);
}

function computeCenter(coords) {
  const ring = coords[0];
  if (!ring || !ring.length) return Cartesian3.ZERO;
  let sl = 0, sL = 0;
  ring.forEach(([lng, lat]) => { sl += lat; sL += lng; });
  return Cartesian3.fromDegrees(sL / ring.length, sl / ring.length, 0);
}

function loadJSON(url) { return fetch(url).then(r => r.json()); }

const T1 = { borderFar: 20000000, labelNear: 5000000, labelFar: 16000000, color: '#ffffff', size: 16 };
const T2 = { borderFar: 8000000, labelNear: 1000000, labelFar: 4500000, color: '#ffffff', size: 18 };
const T3 = { borderFar: 3000000, labelNear: 0, labelFar: 1800000, color: '#ffffff', size: 12 };

const FOOTPRINT_LINE_COLOR = '#D9B477';
const FOOTPRINT_FILL_COLOR = '#D9B477';
const IS_NIGHT_GLOBE = String(import.meta.env.VITE_GLOBE_STYLE || '').trim().toLowerCase() === 'night';

function applyRegionStyles(entityMap, visitedNames, footprintMode) {
  Object.entries(entityMap).forEach(([name, { polygonEntities, labelEntity }]) => {
    const isVisited = visitedNames.has(name);
    // Night-memory opens without administrative overlays. Footprint mode
    // retains the existing boundary and label behavior.
    const isVisible = !IS_NIGHT_GLOBE || footprintMode;

    polygonEntities.forEach((ent) => {
      if (!ent.polygon) return;

      ent.show = isVisible;
      if (IS_NIGHT_GLOBE && !footprintMode) {
        ent.polygon.material = Color.TRANSPARENT;
        ent.polygon.outlineColor = Color.fromCssColorString('#D9B477').withAlpha(0.34);
        ent.polygon.outlineWidth = 1.25;
        ent.polygon.zIndex = 20;
        return;
      }
      if (footprintMode && isVisited) {
        ent.polygon.material = Color.fromCssColorString(FOOTPRINT_FILL_COLOR).withAlpha(0.25);
        ent.polygon.outlineColor = Color.fromCssColorString(FOOTPRINT_LINE_COLOR).withAlpha(0.95);
        ent.polygon.outlineWidth = 4;
        ent.polygon.zIndex = 200;
        return;
      }

      ent.polygon.material = Color.WHITE.withAlpha(0.02);
      ent.polygon.outlineColor = Color.fromCssColorString('#ffffff').withAlpha(0.5);
      ent.polygon.outlineWidth = 2;
      ent.polygon.zIndex = 0;
    });

    if (labelEntity) labelEntity.show = isVisible && (!IS_NIGHT_GLOBE || footprintMode);
  });
}

export default function ChinaRegions() {
  const { viewer } = useCesium();
  const { locations, footprintMode } = useTravel();
  const loadedRef = useRef(false);
  const entityMapRef = useRef({}); // name -> { polygonEntities: [], labelEntity }
  const visitedNamesRef = useRef(new Set());
  const footprintModeRef = useRef(footprintMode);

  // Build a set of visited names (and name variants like "杭州" matching "杭州市")
  const visitedNames = useMemo(() => {
    const s = new Set();
    locations.forEach((loc) => {
      s.add(loc.name);
      s.add(loc.name + '市');
      s.add(loc.name + '区');
      s.add(loc.name + '县');
    });
    return s;
  }, [locations]);

  useEffect(() => {
    visitedNamesRef.current = visitedNames;
    footprintModeRef.current = footprintMode;
    applyRegionStyles(entityMapRef.current, visitedNames, footprintMode);
  }, [footprintMode, visitedNames]);

  useEffect(() => {
    if (!viewer || loadedRef.current) return;
    loadedRef.current = true;
    let disposed = false;

    const addLayer = (url, tier) => {
      const t = tier === 1 ? T1 : tier === 2 ? T2 : T3;
      loadJSON(url).then((data) => {
        if (disposed) return;
        data.features.forEach((feat) => {
          const name = feat.properties?.name;
          const geom = feat.geometry;
          if (!name || !geom || name === '中华人民共和国') return;

          const polygons = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
          let bestCoords = polygons[0], bestLen = bestCoords?.[0]?.length || 0;
          polygons.forEach((pc) => { if (pc[0]?.length > bestLen) { bestCoords = pc; bestLen = pc[0].length; } });

          const labelCenter = computeCenter(bestCoords);
          const polyEntities = [];

          polygons.forEach((polyCoords) => {
            const hierarchy = polygonHierarchyFromCoords(polyCoords);
            if (!hierarchy) return;
            const ent = viewer.entities.add(new Entity({
              polygon: new PolygonGraphics({
                hierarchy,
                material: Color.WHITE.withAlpha(0.02),
                outline: true,
                outlineColor: Color.fromCssColorString(t.color).withAlpha(0.5),
                outlineWidth: tier === 1 ? 2 : tier === 2 ? 1.5 : 1,
                height: 100,
                distanceDisplayCondition: new DistanceDisplayCondition(0, t.borderFar),
              }),
            }));
            polyEntities.push(ent);
          });

          const labelEntity = viewer.entities.add(new Entity({
            position: labelCenter,
            label: new LabelGraphics({
              text: name,
              font: `800 ${t.size}px "Microsoft YaHei", sans-serif`,
              fillColor: Color.fromCssColorString(t.color).withAlpha(0.85),
              outlineColor: Color.BLACK.withAlpha(0.6),
              outlineWidth: 3,
              distanceDisplayCondition: new DistanceDisplayCondition(t.labelNear, t.labelFar),
              translucencyByDistance: new NearFarScalar(t.labelNear, 1.0, t.labelFar, 0.05),
              scaleByDistance: new NearFarScalar(t.labelNear, 1.0, t.labelFar, 0.5),
            }),
          }));

          entityMapRef.current[name] = { polygonEntities: polyEntities, labelEntity, tier };
          applyRegionStyles(
            entityMapRef.current,
            visitedNamesRef.current,
            footprintModeRef.current,
          );
        });
        console.log(`Layer ${tier} loaded:`, data.features.length);
      }).catch((error) => {
        if (!disposed) console.error(`[ChinaRegions] failed to load ${url}`, error);
      });
    };

    addLayer('/china-provinces.json', 1);
    // City-level boundaries are owned by CityAreaGlow. Avoid loading the
    // complete national city bundle when footprint mode is enabled.
    addLayer('/china-districts.json', 3);

    return () => {
      disposed = true;
      Object.values(entityMapRef.current).forEach(({ polygonEntities, labelEntity }) => {
        polygonEntities.forEach((entity) => viewer.entities.remove(entity));
        if (labelEntity) viewer.entities.remove(labelEntity);
      });
      entityMapRef.current = {};
      loadedRef.current = false;
    };
  }, [viewer]);

  return null;
}
