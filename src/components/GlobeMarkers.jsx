import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { BillboardGraphics, Entity, LabelGraphics, PointGraphics, useCesium } from 'resium';
import {
  Cartesian2,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  HorizontalOrigin,
  LabelStyle,
  NearFarScalar,
  VerticalOrigin,
} from 'cesium';
import { getCityMarkerCenter } from '../config/cityMarkerCenters';
import { markGlobeRender } from '../utils/globePerformance';

const CENTER_COLOR = Color.fromCssColorString('#F4E8CF');
const ACTIVE_COLOR = Color.fromCssColorString('#FFF1D8');
const LABEL_COLOR = Color.fromCssColorString('#F2EBDD');
const LABEL_OUTLINE = Color.fromCssColorString('#101411');
// Cesium excludes alpha < 0.005 from picking. 2/255 is visually negligible,
// but keeps a fixed 24px target independent of the light's visible diameter.
const HIT_COLOR = CENTER_COLOR.withAlpha(2 / 255);
const MARKER_DISPLAY = new DistanceDisplayCondition(0, 30000000);
const LABEL_DISPLAY = MARKER_DISPLAY;
const MARKER_SCALE = new NearFarScalar(7000000, 1, 30000000, 0.88);
const MARKER_TRANSITION_MS = 160;
const GLOW_IMAGE = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><radialGradient id="light"><stop stop-color="#E4C28E" stop-opacity=".30"/><stop offset=".35" stop-color="#D6B27E" stop-opacity=".16"/><stop offset=".7" stop-color="#D6B27E" stop-opacity=".04"/><stop offset="1" stop-color="#D6B27E" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#light)"/></svg>'
);

const DEBUG_GLOBE_HOVER = import.meta.env.DEV
  && import.meta.env.VITE_DEBUG_GLOBE_PERF === 'true';

function getCityId(location) {
  return String(location?.cityId || location?.id || '').trim();
}

function getCoordinates(location) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function getTripCount(location) {
  if (Array.isArray(location?.tripIds) && location.tripIds.length) return location.tripIds.length;
  return Array.isArray(location?.trips) ? location.trips.length : 0;
}

function getVisitLabel(location, tripCount) {
  if (tripCount > 1) return String(location.name) + '\n去过 ' + tripCount + ' 次';
  if (tripCount === 1) return String(location.name) + '\n1 次旅行';
  return String(location.name) + '\n尚未记录旅行';
}

function readPickedProperty(properties, key) {
  const property = properties?.[key];
  return typeof property?.getValue === 'function' ? property.getValue() : property;
}

function getEntityId(candidate) {
  if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate);
  return candidate?.id == null ? '' : String(candidate.id);
}

/** Resolve any marker child entity back to its canonical city id. */
export function resolveCityIdFromPick(picked) {
  const candidates = [picked, picked?.id, picked?.primitive];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const interactionType = readPickedProperty(candidate?.properties, 'interactionType');
    if (interactionType && interactionType !== 'city-marker') continue;

    const propertyCityId = readPickedProperty(candidate?.properties, 'cityId');
    if (propertyCityId) return String(propertyCityId);

    const entityId = getEntityId(candidate);
    const match = entityId.match(/^city-marker(?:-(?:ring|aura|selected|ripple|hit))?:(.+)$/);
    if (match?.[1]) return match[1];
  }

  return null;
}

function createMarkerProperties(cityId, markerRole) {
  return {
    cityId,
    interactionType: 'city-marker',
    markerRole,
  };
}

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function useVisitedCities(locations) {
  return useMemo(() => {
    const byCityId = new Map();

    locations.forEach((location) => {
      const cityId = getCityId(location);
      const coordinates = getCoordinates(location);
      if (!cityId || !coordinates) return;

      const existing = byCityId.get(cityId);
      if (!existing) {
        byCityId.set(cityId, {
          cityId,
          location,
          coordinates,
        });
        return;
      }

      const mergedTrips = [
        ...(existing.location.trips || []),
        ...(location.trips || []),
      ];
      existing.location = {
        ...existing.location,
        trips: mergedTrips,
        tripIds: mergedTrips.map((trip) => trip.id).filter(Boolean),
      };
    });

    return Array.from(byCityId.values()).map((city) => {
      const markerCoordinates = getCityMarkerCenter(city.cityId, city.coordinates);
      return {
        ...city,
        markerCoordinates,
        position: Cartesian3.fromDegrees(markerCoordinates.lng, markerCoordinates.lat, 0),
      };
    });
  }, [locations]);
}

// Selection and hover share one active treatment; they never add extra layers.
// Previously hovered cities transition back to default, rather than retaining a state.
function getMarkerStyle(isSelected, isHovered, footprintMode, isDimmed) {
  const active = isSelected || isHovered;
  return {
    size: active ? 7.8 : footprintMode ? 6.7 : 6.2,
    glowSize: active ? 18 : 14,
    alpha: isDimmed ? 0.72 : active ? 1 : 0.92,
    emphasis: active ? 1 : 0,
    labelAlpha: active ? 1 : 0,
  };
}

function setGraphicValue(graphic, key, value) {
  graphic?.[key]?.setValue(value);
}

function applyMarkerStyle(marker, aura, style) {
  setGraphicValue(marker.point, 'pixelSize', style.size);
  const color = Color.lerp(CENTER_COLOR, ACTIVE_COLOR, style.emphasis, new Color());
  setGraphicValue(marker.point, 'color', color.withAlpha(style.alpha));
  setGraphicValue(aura?.billboard, 'width', style.glowSize);
  setGraphicValue(aura?.billboard, 'height', style.glowSize);
  setGraphicValue(aura?.billboard, 'color', Color.WHITE.withAlpha(style.alpha));
  setGraphicValue(marker.label, 'fillColor', LABEL_COLOR.withAlpha(style.labelAlpha));
  setGraphicValue(marker.label, 'outlineColor', LABEL_OUTLINE.withAlpha(style.labelAlpha * 0.45));
}

export default function GlobeMarkers({
  locations,
  selectedId,
  hoveredCityId,
  footprintMode,
  onSelect,
  onHoverChange,
  onPreviewChange,
}) {
  const reduceMotion = useReducedMotion();
  const { viewer } = useCesium();
  const visitedCities = useVisitedCities(locations);
  const markerStylesRef = useRef(new Map());
  const hoverLeaveTimerRef = useRef(null);
  const previewLeaveTimerRef = useRef(null);
  const previewTimerRef = useRef(null);
  const hoveredIdRef = useRef(null);
  const previewCityIdRef = useRef(null);
  const [coarsePointer, setCoarsePointer] = useState(() => (
    typeof window !== 'undefined'
      && Boolean(window.matchMedia?.('(hover: none), (pointer: coarse)').matches)
  ));
  const showMarkerDiagnostics = import.meta.env.DEV
    && import.meta.env.VITE_SHOW_CITY_BOUNDARY_ALIGNMENT_DEBUG === 'true';

  markGlobeRender('GlobeMarkers');

  useEffect(() => () => {
    if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    if (previewLeaveTimerRef.current) clearTimeout(previewLeaveTimerRef.current);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    hoveredIdRef.current = null;
    previewCityIdRef.current = null;
    onHoverChange?.(null);
    onPreviewChange?.(null);
  }, [onHoverChange, onPreviewChange]);
  useEffect(() => {
    const query = window.matchMedia?.('(hover: none), (pointer: coarse)');
    if (!query) return undefined;
    const updatePointerMode = () => setCoarsePointer(query.matches);
    updatePointerMode();
    query.addEventListener?.('change', updatePointerMode);
    return () => query.removeEventListener?.('change', updatePointerMode);
  }, []);
  useEffect(() => {
    if (!footprintMode) return;
    if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    if (previewLeaveTimerRef.current) clearTimeout(previewLeaveTimerRef.current);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    hoveredIdRef.current = null;
    previewCityIdRef.current = null;
    onHoverChange?.(null);
    onPreviewChange?.(null);
  }, [footprintMode, onHoverChange, onPreviewChange]);

  useEffect(() => {
    if (!showMarkerDiagnostics || !viewer) return;
    const guangzhou = visitedCities.find(({ location }) => String(location.name) === '\u5e7f\u5dde');
    if (!guangzhou) return;

    const markerEntityId = 'city-marker:' + guangzhou.cityId;
    const entity = viewer.entities.getById(markerEntityId);
    console.info('[GlobeMarkers] Guangzhou marker state', {
      markerEntityId,
      entityExists: Boolean(entity),
      entityShow: entity?.show,
      pointShow: entity?.point?.show,
      billboardShow: entity?.billboard?.show,
      labelShow: entity?.label?.show,
      pointPixelSize: entity?.point?.pixelSize,
      billboardScale: entity?.billboard?.scale,
      hoveredCityId,
      selectedId,
      markerStillInCities: visitedCities.some(({ cityId }) => cityId === guangzhou.cityId),
    });
  }, [hoveredCityId, selectedId, showMarkerDiagnostics, viewer, visitedCities]);


  useEffect(() => {
    if (!viewer) return undefined;
    const styles = markerStylesRef.current;
    const transitions = [];
    const cityIds = new Set(visitedCities.map(({ cityId }) => cityId));
    styles.forEach((_, cityId) => { if (!cityIds.has(cityId)) styles.delete(cityId); });
    visitedCities.forEach(({ cityId, location }) => {
      const marker = viewer.entities.getById('city-marker:' + cityId);
      const aura = viewer.entities.getById('city-marker-aura:' + cityId);
      if (!marker?.point || !aura?.billboard) return;
      const isSelected = selectedId === cityId || selectedId === location.id;
      const isHovered = hoveredCityId === cityId;
      const isDimmed = Boolean(selectedId || hoveredCityId) && !isSelected && !isHovered && !footprintMode;
      const target = getMarkerStyle(isSelected, isHovered, footprintMode, isDimmed);
      const current = styles.get(cityId) || getMarkerStyle(false, false, false, false);
      if (reduceMotion || Object.keys(target).every((key) => current[key] === target[key])) {
        applyMarkerStyle(marker, aura, target);
        styles.set(cityId, target);
      } else {
        transitions.push({ cityId, marker, aura, current, target });
      }
    });
    if (!transitions.length) return undefined;
    const started = getNow();
    let frameId;
    const frame = () => {
      const elapsed = getNow() - started;
      const progress = Math.min(1, elapsed / MARKER_TRANSITION_MS);
      const eased = progress * (2 - progress);
      transitions.forEach(({ cityId, marker, aura, current, target }) => {
        const next = {};
        Object.keys(target).forEach((key) => {
          // The light responds first; the nearby name follows within the same 160ms.
          const amount = key === 'labelAlpha' && target.labelAlpha > current.labelAlpha
            ? Math.min(1, Math.max(0, (elapsed - 70) / 90)) : eased;
          next[key] = current[key] + (target[key] - current[key]) * amount;
        });
        applyMarkerStyle(marker, aura, next);
        styles.set(cityId, progress === 1 ? target : next);
      });
      viewer.scene.requestRender();
      if (progress < 1) frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [viewer, visitedCities, selectedId, hoveredCityId, footprintMode, reduceMotion]);

  const handleEnter = (cityId, pickedEntityId) => {
    const resolvedCityId = resolveCityIdFromPick({
      id: pickedEntityId,
      properties: createMarkerProperties(cityId, 'hover-target'),
    }) || cityId;

    if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    if (previewLeaveTimerRef.current) clearTimeout(previewLeaveTimerRef.current);
    if (hoveredIdRef.current === resolvedCityId) {
      if (!coarsePointer && !previewTimerRef.current && previewCityIdRef.current !== resolvedCityId) {
        previewTimerRef.current = setTimeout(() => {
          if (hoveredIdRef.current !== resolvedCityId) return;
          onPreviewChange?.(resolvedCityId);
          previewCityIdRef.current = resolvedCityId;
          previewTimerRef.current = null;
        }, 600);
      }
      return;
    }
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    hoverLeaveTimerRef.current = null;
    previewTimerRef.current = null;
    hoveredIdRef.current = resolvedCityId;
    previewCityIdRef.current = null;
    onHoverChange?.(resolvedCityId);
    onPreviewChange?.(null);
    if (DEBUG_GLOBE_HOVER) {
      console.info('[GlobeHover]', JSON.stringify({
        event: 'target',
        pickedEntityId,
        resolvedCityId,
        markerRole: 'city-marker',
      }));
    }
    if (!coarsePointer) {
      previewTimerRef.current = setTimeout(() => {
        if (hoveredIdRef.current !== resolvedCityId) return;
        onPreviewChange?.(resolvedCityId);
        previewCityIdRef.current = resolvedCityId;
        previewTimerRef.current = null;
      }, 600);
    }
  };

  const handleLeave = (cityId) => {
    if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    if (previewLeaveTimerRef.current) clearTimeout(previewLeaveTimerRef.current);
    if (hoveredIdRef.current !== cityId) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
    hoverLeaveTimerRef.current = setTimeout(() => {
      if (hoveredIdRef.current === cityId) {
        hoveredIdRef.current = null;
        onHoverChange?.(null);
        onPreviewChange?.(null);
        previewCityIdRef.current = null;
      }
      hoverLeaveTimerRef.current = null;
      previewLeaveTimerRef.current = null;
    }, 180);
    previewLeaveTimerRef.current = hoverLeaveTimerRef.current;
  };

  return (
    <>
      {visitedCities.map(({ cityId, location, position }) => {
        const isSelected = selectedId === cityId || selectedId === location.id;
        const isHovered = hoveredCityId === cityId;
        const markerEntityId = 'city-marker:' + cityId;
        const auraEntityId = 'city-marker-aura:' + cityId;
        const hitEntityId = 'city-marker-hit:' + cityId;
        const markerEventProps = {
          onClick: () => {
            onPreviewChange?.(null);
            onSelect(location);
          },
          onMouseEnter: () => handleEnter(cityId, markerEntityId),
          onMouseLeave: () => handleLeave(cityId),
        };
        return (
          <Fragment key={'city-marker-group:' + cityId}>
            <Entity
              id={markerEntityId}
              name={String(location.name)}
              description={getVisitLabel(location, getTripCount(location))}
              position={position}
              properties={createMarkerProperties(cityId, 'marker')}
              {...markerEventProps}
            >
              <PointGraphics
                show={true}
                pixelSize={6.2}
                color={CENTER_COLOR}
                outlineColor={Color.TRANSPARENT}
                outlineWidth={0}
                disableDepthTestDistance={0}
                distanceDisplayCondition={MARKER_DISPLAY}
                scaleByDistance={MARKER_SCALE}
              />
              <LabelGraphics
                show={isSelected || isHovered}
                text={String(location.name)}
                font='400 15px "PingFang SC", "Microsoft YaHei", sans-serif'
                fillColor={LABEL_COLOR}
                outlineColor={LABEL_OUTLINE.withAlpha(0.45)}
                outlineWidth={1}
                showBackground={false}
                style={LabelStyle.FILL_AND_OUTLINE}
                horizontalOrigin={HorizontalOrigin.LEFT}
                verticalOrigin={VerticalOrigin.BOTTOM}
                pixelOffset={new Cartesian2(12, -5)}
                distanceDisplayCondition={LABEL_DISPLAY}
                disableDepthTestDistance={Number.POSITIVE_INFINITY}
              />
            </Entity>
            <Entity
              id={auraEntityId}
              position={position}
              properties={createMarkerProperties(cityId, 'aura')}
              {...markerEventProps}
              onMouseEnter={() => handleEnter(cityId, auraEntityId)}
            >
              <BillboardGraphics
                show={true}
                image={GLOW_IMAGE}
                width={14}
                height={14}
                color={Color.WHITE}
                horizontalOrigin={HorizontalOrigin.CENTER}
                verticalOrigin={VerticalOrigin.CENTER}
                disableDepthTestDistance={0}
                distanceDisplayCondition={MARKER_DISPLAY}
                scaleByDistance={MARKER_SCALE}
              />
            </Entity>
            <Entity
              id={hitEntityId}
              position={position}
              properties={createMarkerProperties(cityId, 'hit')}
              {...markerEventProps}
              onMouseEnter={() => handleEnter(cityId, hitEntityId)}
            >
              <PointGraphics
                show={true}
                pixelSize={coarsePointer ? 44 : 24}
                color={HIT_COLOR}
                outlineColor={HIT_COLOR}
                outlineWidth={0}
                disableDepthTestDistance={0}
                distanceDisplayCondition={MARKER_DISPLAY}
              />
            </Entity>
          </Fragment>
        );
      })}
    </>
  );
}
