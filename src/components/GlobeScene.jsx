import { useCallback, useEffect, useRef, useState } from 'react';
import { Viewer, useCesium } from 'resium';
import {
  Cartesian3,
  Color,
  Credit,
  DirectionalLight,
  Ion,
  SingleTileImageryProvider,
  UrlTemplateImageryProvider,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useTravel } from '../context/TravelContext';
import GlobeMarkers from './GlobeMarkers';
import CameraFlyer from './CameraFlyer';
import CameraZoomWatcher from './CameraZoomWatcher';
import StarsBackground from './StarsBackground';
import ChinaRegions from './ChinaRegions';
import CityAreaGlow from './CityAreaGlow';
import { attachGlobePerf } from '../utils/globePerformance';


const CESIUM_ION_TOKEN = String(import.meta.env.VITE_CESIUM_ION_TOKEN || '').trim();

if (CESIUM_ION_TOKEN) {
  Ion.defaultAccessToken = CESIUM_ION_TOKEN;
}

const ESRI_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_CREDIT = '\u00A9 Esri, Maxar, Earthstar Geographics, and the GIS User Community';
const FALLBACK_EARTH_URL = '/retro-atlas/earth-natural-earth-ii-2048.jpg';
const MAXIMUM_SCREEN_SPACE_ERROR = 1.5;
const DESKTOP_RESOLUTION_SCALE_LIMIT = 1.5;
const ENABLE_MINIMAL_GLOBE_STYLE = import.meta.env.VITE_ENABLE_MINIMAL_GLOBE_STYLE === 'true';
const GLOBE_STYLE = String(
  import.meta.env.VITE_GLOBE_STYLE || (ENABLE_MINIMAL_GLOBE_STYLE ? 'minimal' : 'satellite')
).trim().toLowerCase();
const IS_NIGHT_GLOBE = GLOBE_STYLE === 'night';
const IS_RETRO_ATLAS = GLOBE_STYLE === 'retro-atlas';
const RETRO_ATLAS_TEXTURE_MODE = String(import.meta.env.VITE_RETRO_ATLAS_TEXTURE_MODE || 'remastered').trim().toLowerCase();
const IS_SEGMENTED_RETRO_TEXTURE = RETRO_ATLAS_TEXTURE_MODE === 'segmented';
const IS_REFERENCE_FULL_RETRO_TEXTURE = RETRO_ATLAS_TEXTURE_MODE === 'reference-full';
const IS_REFERENCE_RESTORED_RETRO_TEXTURE = RETRO_ATLAS_TEXTURE_MODE === 'reference-restored';
const IS_BAKED_RETRO_TEXTURE = RETRO_ATLAS_TEXTURE_MODE !== 'legacy';
const RETRO_ATLAS_TEXTURE_URL = IS_REFERENCE_RESTORED_RETRO_TEXTURE
  ? '/retro-atlas/retro-atlas-reference-restored-8192.jpg'
  : IS_REFERENCE_FULL_RETRO_TEXTURE
  ? '/retro-atlas/retro-atlas-reference-full-8192.jpg'
  : IS_SEGMENTED_RETRO_TEXTURE
    ? '/retro-atlas/retro-atlas-segmented-8192.jpg'
  : IS_BAKED_RETRO_TEXTURE
    ? '/retro-atlas/retro-atlas-remastered-8192.jpg'
    : '/retro-atlas/earth-retro-paper-8192.jpg';
const RETRO_ATLAS_TEXTURE_SIZE = { width: 8192, height: 4096 };
const RETRO_MOUNTAINS_TEXTURE_URL = '/retro-atlas/earth-retro-mountains-8192.png';
const RETRO_MOUNTAINS_TEXTURE_SIZE = { width: 8192, height: 4096 };
const RETRO_TERRAIN_TEXTURE_URL = '/retro-atlas/earth-retro-terrain-lines-8192.png';
const RETRO_TERRAIN_TEXTURE_SIZE = { width: 8192, height: 4096 };
const RETRO_GRATICULE_TEXTURE_URL = '/retro-atlas/earth-retro-graticule-8192.png';
const RETRO_GRATICULE_TEXTURE_SIZE = { width: 8192, height: 4096 };
const SHOW_RETRO_MOUNTAINS = import.meta.env.VITE_RETRO_SHOW_MOUNTAINS !== 'false';
const RETRO_MOUNTAINS_OPACITY = Number(import.meta.env.VITE_RETRO_MOUNTAINS_OPACITY || 0.22);
const SHOW_RETRO_TERRAIN_LINES = import.meta.env.VITE_RETRO_SHOW_TERRAIN_LINES !== 'false';
const RETRO_TERRAIN_OPACITY = Number(import.meta.env.VITE_RETRO_TERRAIN_LINES_OPACITY || 0.11);
const SHOW_RETRO_GRATICULE = import.meta.env.VITE_RETRO_SHOW_GRATICULE !== 'false';
const RETRO_GRATICULE_OPACITY = Number(import.meta.env.VITE_RETRO_GRATICULE_OPACITY || 0.07);

function getResolutionScale() {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const isSmallScreen = window.matchMedia?.('(max-width: 768px)').matches
    ?? window.innerWidth <= 768;

  return isSmallScreen ? 1 : Math.min(devicePixelRatio, DESKTOP_RESOLUTION_SCALE_LIMIT);
}

function ImagerySetup() {
  const { viewer } = useCesium();

  useEffect(() => {
    if (!viewer) return;
    const addedLayers = [];

    const globe = viewer.scene.globe;
    const scene = viewer.scene;
    const previousSceneLight = scene.light;
    const previousBackgroundColor = scene.backgroundColor;
    const skyAtmosphere = scene.skyAtmosphere;
    const previousSkySettings = skyAtmosphere && {
      atmosphereLightIntensity: skyAtmosphere.atmosphereLightIntensity,
      atmosphereRayleighScaleHeight: skyAtmosphere.atmosphereRayleighScaleHeight,
      atmosphereMieScaleHeight: skyAtmosphere.atmosphereMieScaleHeight,
      saturationShift: skyAtmosphere.saturationShift,
      brightnessShift: skyAtmosphere.brightnessShift,
    };
    const previousRenderSettings = {
      maximumScreenSpaceError: globe.maximumScreenSpaceError,
      baseColor: globe.baseColor,
      lightingFadeOutDistance: globe.lightingFadeOutDistance,
      lightingFadeInDistance: globe.lightingFadeInDistance,
      enableLighting: globe.enableLighting,
      dynamicAtmosphereLighting: globe.dynamicAtmosphereLighting,
      dynamicAtmosphereLightingFromSun: globe.dynamicAtmosphereLightingFromSun,
      showGroundAtmosphere: globe.showGroundAtmosphere,
      atmosphereLightIntensity: globe.atmosphereLightIntensity,
      atmosphereBrightnessShift: globe.atmosphereBrightnessShift,
      atmosphereSaturationShift: globe.atmosphereSaturationShift,
    };

    // The default is 2.0. A moderate 1.5 value refines close tiles without
    // taking the aggressive 1.0 path before the first visual comparison.
    Object.assign(globe, {
      maximumScreenSpaceError: MAXIMUM_SCREEN_SPACE_ERROR,
    });

    // Keep the globe visible while remote ArcGIS tiles are loading or unavailable.
    // The opaque ArcGIS layer remains above this local real-geography fallback.
    if (!IS_RETRO_ATLAS) {
      const fallbackLayer = viewer.imageryLayers.addImageryProvider(new SingleTileImageryProvider({
        url: FALLBACK_EARTH_URL,
        tileWidth: 2048,
        tileHeight: 1024,
        credit: new Credit('Natural Earth II, public domain'),
      }));
      addedLayers.push(fallbackLayer);
    }

    // Retro atlas uses one local Natural Earth equirectangular map. The other
    // styles keep the existing ArcGIS imagery provider and tuning.
    const imageryProvider = IS_RETRO_ATLAS
      ? new SingleTileImageryProvider({
        url: RETRO_ATLAS_TEXTURE_URL,
        tileWidth: RETRO_ATLAS_TEXTURE_SIZE.width,
        tileHeight: RETRO_ATLAS_TEXTURE_SIZE.height,
        credit: new Credit('Natural Earth II, public domain; local retro color grade'),
      })
      : new UrlTemplateImageryProvider({
        url: ESRI_URL,
        maximumLevel: 20,
        credit: new Credit(ESRI_CREDIT),
      });
    const imageryLayer = viewer.imageryLayers.addImageryProvider(imageryProvider);
    addedLayers.push(imageryLayer);

    if (IS_RETRO_ATLAS && !IS_BAKED_RETRO_TEXTURE && SHOW_RETRO_MOUNTAINS) {
      const mountainProvider = new SingleTileImageryProvider({
        url: RETRO_MOUNTAINS_TEXTURE_URL,
        tileWidth: RETRO_MOUNTAINS_TEXTURE_SIZE.width,
        tileHeight: RETRO_MOUNTAINS_TEXTURE_SIZE.height,
      });
      const mountainLayer = viewer.imageryLayers.addImageryProvider(mountainProvider);
      mountainLayer.alpha = Math.min(1, Math.max(0, RETRO_MOUNTAINS_OPACITY));
      addedLayers.push(mountainLayer);
    }

    if (IS_RETRO_ATLAS && !IS_BAKED_RETRO_TEXTURE && SHOW_RETRO_TERRAIN_LINES) {
      const terrainProvider = new SingleTileImageryProvider({
        url: RETRO_TERRAIN_TEXTURE_URL,
        tileWidth: RETRO_TERRAIN_TEXTURE_SIZE.width,
        tileHeight: RETRO_TERRAIN_TEXTURE_SIZE.height,
      });
      const terrainLayer = viewer.imageryLayers.addImageryProvider(terrainProvider);
      terrainLayer.alpha = Math.min(1, Math.max(0, RETRO_TERRAIN_OPACITY));
      addedLayers.push(terrainLayer);
    }

    if (IS_RETRO_ATLAS && !IS_BAKED_RETRO_TEXTURE && SHOW_RETRO_GRATICULE) {
      const graticuleProvider = new SingleTileImageryProvider({
        url: RETRO_GRATICULE_TEXTURE_URL,
        tileWidth: RETRO_GRATICULE_TEXTURE_SIZE.width,
        tileHeight: RETRO_GRATICULE_TEXTURE_SIZE.height,
      });
      const graticuleLayer = viewer.imageryLayers.addImageryProvider(graticuleProvider);
      graticuleLayer.alpha = Math.min(1, Math.max(0, RETRO_GRATICULE_OPACITY));
      addedLayers.push(graticuleLayer);
    }
    if (imageryLayer && !IS_RETRO_ATLAS) {
      const imageryStyle = IS_NIGHT_GLOBE
        ? { brightness: 0.64, contrast: 1.02, saturation: 0.34, gamma: 1.12 }
        : GLOBE_STYLE === 'minimal'
        ? { brightness: 0.96, contrast: 1.04, saturation: 0.78, gamma: 0.99 }
        : { brightness: 1.08, contrast: 1.05, saturation: 1.08, gamma: 0.98 };
      Object.assign(imageryLayer, imageryStyle);
    }

    if (import.meta.env.DEV) {
      console.debug('[Globe] imagery layers', {
        count: viewer.imageryLayers.length,
        style: GLOBE_STYLE,
        types: Array.from({ length: viewer.imageryLayers.length }, (_, index) => (
          viewer.imageryLayers.get(index)?.imageryProvider?.constructor?.name || 'Unknown'
        )),
      });
    }

    Object.assign(globe, {
      enableLighting: true,
      dynamicAtmosphereLighting: !IS_NIGHT_GLOBE,
      dynamicAtmosphereLightingFromSun: !IS_NIGHT_GLOBE,
      showGroundAtmosphere: true,
      baseColor: IS_NIGHT_GLOBE ? Color.fromCssColorString('#081317') : globe.baseColor,
      atmosphereLightIntensity: IS_NIGHT_GLOBE ? 1.2 : 7.5,
      atmosphereBrightnessShift: IS_NIGHT_GLOBE ? -0.24 : 0,
      atmosphereSaturationShift: IS_NIGHT_GLOBE ? -0.65 : 0,
    });

    if (IS_NIGHT_GLOBE) {
      // A cool, fixed key light keeps the opening view independent of local time.
      // Partial day/night shading preserves the imagery in the unlit hemisphere.
      // Ground haze stays neutral instead of darkening the night side a second time.
      Object.assign(scene, {
        backgroundColor: Color.fromCssColorString('#040709'),
        light: new DirectionalLight({
          direction: Cartesian3.normalize(new Cartesian3(0.35, -0.55, -0.76), new Cartesian3()),
          color: Color.fromCssColorString('#DDE6EE'),
          intensity: 0.65,
        }),
      });
      Object.assign(globe, { lightingFadeOutDistance: 0, lightingFadeInDistance: 50000000 });
      if (skyAtmosphere) {
        Object.assign(skyAtmosphere, {
          atmosphereLightIntensity: 6,
          atmosphereRayleighScaleHeight: 4500,
          atmosphereMieScaleHeight: 1600,
          saturationShift: -0.7,
          brightnessShift: -0.2,
        });
      }
    }

    return () => {
      addedLayers.slice().reverse().forEach((layer) => viewer.imageryLayers.remove(layer, true));
      Object.assign(globe, previousRenderSettings);
      Object.assign(scene, { light: previousSceneLight, backgroundColor: previousBackgroundColor });
      if (skyAtmosphere && previousSkySettings) Object.assign(skyAtmosphere, previousSkySettings);
    };
  }, [viewer]);

  return null;
}

function GlobePerformanceProbe({ startedAt }) {
  const { viewer } = useCesium();
  const measuredViewerRef = useRef(null);

  useEffect(() => attachGlobePerf(viewer), [viewer]);

  useEffect(() => {
    if (!import.meta.env.DEV || !viewer || measuredViewerRef.current === viewer) return;
    measuredViewerRef.current = viewer;
    performance.mark('travel-memory:globe-viewer-start', { startTime: startedAt });
    performance.mark('travel-memory:globe-viewer-ready');
    const measure = performance.measure(
      'travel-memory:globe-viewer-init',
      'travel-memory:globe-viewer-start',
      'travel-memory:globe-viewer-ready',
    );
    console.info('[Travel Memory performance] Globe Viewer ready', {
      durationMs: Math.round(measure.duration),
    });
  }, [startedAt, viewer]);

  return null;
}

export default function GlobeScene({ onSelectCity, onPreviewChange }) {
  const { locations, selectedId, footprintMode } = useTravel();
  const [hoveredCityId, setHoveredCityId] = useState(null);
  const [viewerStartedAt] = useState(() => import.meta.env.DEV ? performance.now() : 0);
  const handleHoverChange = useCallback((cityId) => {
    setHoveredCityId(cityId || null);
  }, []);
  const handleSelectCity = useCallback((location) => {
    onSelectCity?.(location);
  }, [onSelectCity]);

  if (!CESIUM_ION_TOKEN) {
    return (
      <div className="globe-config-error" role="alert" aria-live="polite">
        <div className="globe-config-error__inner">
          <span>MAP CONFIGURATION</span>
          <strong>地球服务配置缺失</strong>
          <small>请在本地环境配置 VITE_CESIUM_ION_TOKEN。</small>
        </div>
      </div>
    );
  }

  const renderResolutionScale = getResolutionScale();

  return (
    <Viewer
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}
      useBrowserRecommendedResolution
      resolutionScale={renderResolutionScale}
      skyBox={IS_NIGHT_GLOBE ? false : undefined}
      baseLayer={false}
      baseLayerPicker={false}
      homeButton={false}
      sceneModePicker={false}
      navigationHelpButton={false}
      geocoder={false}
      fullscreenButton={false}
      animation={false}
      timeline={false}
      infoBox={false}
      selectionIndicator={false}
    >
      <ImagerySetup />
      <GlobePerformanceProbe startedAt={viewerStartedAt} />
      <StarsBackground />
      <ChinaRegions />
      <CityAreaGlow hoveredCityId={hoveredCityId} />
      <GlobeMarkers
        locations={locations}
        selectedId={selectedId}
        hoveredCityId={hoveredCityId}
        footprintMode={footprintMode}
        onSelect={handleSelectCity}
        onHoverChange={handleHoverChange}
        onPreviewChange={onPreviewChange}
      />
      <CameraFlyer hoveredCityId={hoveredCityId} />
      <CameraZoomWatcher />
    </Viewer>
  );
}
