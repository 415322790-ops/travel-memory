import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import { Cartesian3, Math as CesiumMath } from 'cesium';
import { useTravel } from '../context/TravelContext';

function captureCameraView(camera) {
  return {
    destination: Cartesian3.clone(camera.position),
    orientation: {
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
    },
  };
}

export default function CameraFlyer({ hoveredCityId }) {
  const { locations, selectedId } = useTravel();
  const { viewer } = useCesium();
  const previousSelectedRef = useRef(null);
  const returnViewRef = useRef(null);
  const animFrameRef = useRef(null);
  const initializedViewerRef = useRef(null);

  // Set the opening direction once; later selections and data edits must not reset it.
  useEffect(() => {
    if (!viewer || initializedViewerRef.current === viewer) return;
    initializedViewerRef.current = viewer;
    const cities = new Map();
    locations.forEach((location) => {
      const lat = Number(location.lat);
      const lng = Number(location.lng);
      if (location.lat == null || location.lng == null
        || !Number.isFinite(lat) || !Number.isFinite(lng)
        || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
      cities.set(location.cityId || location.id || `${lat},${lng}`, { lat, lng });
    });
    const direction = new Cartesian3();
    cities.forEach(({ lat, lng }) => {
      const latitude = CesiumMath.toRadians(lat);
      const longitude = CesiumMath.toRadians(lng);
      direction.x += Math.cos(latitude) * Math.cos(longitude);
      direction.y += Math.cos(latitude) * Math.sin(longitude);
      direction.z += Math.sin(latitude);
    });
    // A spherical mean also handles cities on opposite sides of the date line.
    const hasCenter = Cartesian3.magnitude(direction) > cities.size * 0.1;
    const fallback = cities.values().next().value || { lng: 108, lat: 30 };
    const longitude = hasCenter ? CesiumMath.toDegrees(Math.atan2(direction.y, direction.x)) : fallback.lng;
    const latitude = hasCenter ? CesiumMath.toDegrees(Math.atan2(direction.z, Math.hypot(direction.x, direction.y))) : fallback.lat;
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(longitude, latitude, viewer.camera.positionCartographic.height),
      orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 },
    });
  }, [viewer, locations]);

  // Auto-rotate ? stops permanently after first user interaction
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!viewer || stoppedRef.current) return undefined;
    const initialDist = Cartesian3.magnitude(viewer.camera.position);

    const rotate = () => {
      const dist = Cartesian3.magnitude(viewer.camera.position);
      // Stop when user zooms in, clicks a location, or scrolls
      if (dist < initialDist * 0.85 || selectedId) {
        stoppedRef.current = true;
        animFrameRef.current = null;
        return;
      }
      if (!hoveredCityId) {
        viewer.camera.rotate(Cartesian3.UNIT_Z, 0.0005);
      }
      animFrameRef.current = requestAnimationFrame(rotate);
    };

    animFrameRef.current = requestAnimationFrame(rotate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [viewer, selectedId, hoveredCityId]);

  useEffect(() => {
    if (!viewer) return;

    const previousSelectedId = previousSelectedRef.current;

    if (selectedId) {
      const loc = locations.find((l) => l.id === selectedId);
      if (!loc) return;

      if (!previousSelectedId) {
        returnViewRef.current = captureCameraView(viewer.camera);
      }

      viewer.camera.cancelFlight();
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(loc.lng, loc.lat, 400000),
        orientation: {
          heading: CesiumMath.toRadians(0),
          pitch: CesiumMath.toRadians(-75),
          roll: 0,
        },
        duration: 2.0,
        easing: (t) => t * (2 - t),
      });
      previousSelectedRef.current = selectedId;
      return;
    }

    if (previousSelectedId && returnViewRef.current) {
      viewer.camera.cancelFlight();
      viewer.camera.flyTo({
        destination: returnViewRef.current.destination,
        orientation: returnViewRef.current.orientation,
        duration: 1.5,
        easing: (t) => t * (2 - t),
      });
      previousSelectedRef.current = null;
    }
  }, [viewer, selectedId, locations]);

  return null;
}
