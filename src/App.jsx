import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { TravelProvider, useTravel } from './context/TravelContext';
import { getDefaultTrip } from './utils/tripSelection';
import { countLocationPhotos } from './utils/photoStatistics';
import ActionIcon from './components/ActionIcon';
const TimeJourney = lazy(() => import('./components/TimeJourney'));
import './App.css';

const GlobeScene = lazy(() => import('./components/GlobeScene'));
const SolarScene = lazy(() => import('./components/SolarScene'));
const LocationPanel = lazy(() => import('./components/LocationPanel'));
const GlobeCityPanel = lazy(() => import('./components/GlobeCityPanel'));
const AddLocationForm = lazy(() => import('./components/AddLocationForm'));
const BgMusicPlayer = lazy(() => import('./components/MusicPlayer'));
const GLOBE_STYLE = String(import.meta.env.VITE_GLOBE_STYLE || 'satellite').trim().toLowerCase();
const NAV_VISIBILITY = Object.freeze({
  globe: true,
  timeline: true,
  footprints: true,
  about: false,
});


class TimelineErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="flight-journey flight-error-state" role="alert" aria-live="assertive">
          <section className="flight-error-message">
            <p>时间旅途暂时无法显示</p>
            <span>可以重新尝试，或返回地球继续浏览。</span>
            <div className="flight-error-actions">
              <button type="button" onClick={() => this.setState({ failed: false })}>重新尝试</button>
              <button type="button" onClick={this.props.onBack}>返回地球</button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="app-error-state" role="alert" aria-live="assertive">
          <section className="app-error-message">
            <span className="app-error-brand">TRAVEL MEMORY</span>
            <h1>旅行记忆暂时出现问题</h1>
            <p>当前页面无法显示。可以重新尝试，或返回首页继续浏览。</p>
            <div className="app-error-actions">
              <button type="button" onClick={() => this.setState({ failed: false })}>重新尝试</button>
              <button type="button" onClick={() => window.location.assign(window.location.pathname)}>返回首页</button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

function TopNav({ onStartRecord }) {
  const { viewMode, setViewMode, footprintMode, setFootprintMode } = useTravel();

  return (
    <nav className="top-nav">
      <div className="nav-logo">
        <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M50 5C25.2 5 5 25.2 5 50s20.2 45 45 45 45-20.2 45-45S74.8 5 50 5zm0 8c20.4 0 37 16.6 37 37s-16.6 37-37 37S13 70.4 13 50 29.6 13 50 13z" fill="rgba(255,255,255,0.9)"/>
          <path d="M50 25c-13.8 0-25 11.2-25 25s11.2 25 25 25 25-11.2 25-25-11.2-25-25-25zm0 8c8.3 0 15 6.7 15 15s-6.7 15-15 15-15-6.7-15-15 6.7-15 15-15z" fill="rgba(255,255,255,0.6)"/>
          <circle cx="50" cy="50" r="5" fill="#2dd4a8"/>
        </svg>
        <span>TRAVEL MEMORY</span>
      </div>

      <div className="nav-links">
        <a href="#" className={`nav-link ${viewMode === 'earth' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setViewMode('earth'); }}>地球</a>
        {NAV_VISIBILITY.timeline && (
        <button
          type="button"
          className={`nav-link nav-link-button ${viewMode === 'timeline' ? 'active' : ''}`}
          onClick={() => setViewMode('timeline')}
        >
          时间旅途
        </button>
        )}
        <a href="#" className="nav-link" onClick={(e) => { e.preventDefault(); setFootprintMode(!footprintMode); }}
          style={footprintMode ? { color: '#c8a46a' } : {}}>
          足迹
        </a>
        {NAV_VISIBILITY.about && <a href="#" className="nav-link">关于</a>}
      </div>

      <button className="nav-cta" onClick={onStartRecord}>
        记录一次旅行
      </button>
    </nav>
  );
}

function MobileNav({ onStartRecord }) {
  const { setViewMode } = useTravel();

  return (
    <nav className="mobile-nav" aria-label="主要导航">
      <button type="button" className="mobile-nav__item is-active" onClick={() => setViewMode('earth')} aria-current="page">
        <span aria-hidden="true"><ActionIcon name="globe" size={20} /></span>
        <small>地球</small>
      </button>
      <button type="button" className="mobile-nav__item" onClick={() => setViewMode('timeline')}>
        <span aria-hidden="true"><ActionIcon name="clock" size={20} /></span>
        <small>时间旅途</small>
      </button>
      <button type="button" className="mobile-nav__item mobile-nav__record" onClick={onStartRecord}>
        <span aria-hidden="true"><ActionIcon name="plus" size={18} /></span>
        <small>记录旅行</small>
      </button>
    </nav>
  );
}

function HeroSection({ onStartRecord }) {
  const { locations } = useTravel();
  const hasLocations = locations.length > 0;
  const cityCount = new Set(locations.map((location) => location.name)).size;
  const photoCount = countLocationPhotos(locations);

  return (
    <div className="hero-section">
      <div className="hero-copy">
        <span className="hero-eyebrow">TRAVEL MEMORY</span>
        <h1 className="hero-title">旅行记忆<sup className="hero-tm">™</sup></h1>
        <p className="hero-subtitle">每一段旅程，都是时光的胶片</p>
        <p className="hero-description">{hasLocations ? '记录走过的路，看过的风景，遇见的人。' : '还没有保存的城市。从第一段旅程开始，点亮你的旅行记忆。'}</p>

      {hasLocations ? <div className="hero-stats" aria-label="旅行记录统计">
        <div>
          <strong>{cityCount}</strong>
          <span>去过的城市</span>
        </div>
        <div>
          <strong>{photoCount}</strong>
          <span>张照片</span>
        </div>
      </div> : <button type="button" className="hero-empty-cta" onClick={onStartRecord}>记录第一次旅行</button>}


      <p className="hero-hint">{hasLocations ? '拖动地球，探索我的足迹' : '这里会保存你走过的每一座城市'}</p>
      </div>
    </div>
  );
}

function ViewToggle() {
  const { viewMode, setViewMode } = useTravel();

  return (
    <button
      className="view-toggle"
      onClick={() => setViewMode(viewMode === 'earth' ? 'solar' : 'earth')}
      title={viewMode === 'earth' ? '切换到太阳系视图' : '切换到地球视图'}
      aria-label={viewMode === 'earth' ? '切换到太阳系视图' : '切换到地球视图'}
    >
      <ActionIcon name={viewMode === 'earth' ? 'sun' : 'globe'} size={20} />
    </button>
  );
}

function FootprintToggle() {
  const { footprintMode, setFootprintMode } = useTravel();

  return (
    <button
      className="footprint-toggle"
      onClick={() => setFootprintMode(!footprintMode)}
      title={footprintMode ? '关闭足迹点亮' : '点亮足迹'}
      aria-label={footprintMode ? '关闭足迹点亮' : '点亮足迹'}
      aria-pressed={footprintMode}
      style={footprintMode ? {
        background: 'rgba(200, 164, 106, 0.16)',
        borderColor: 'rgba(200, 164, 106, 0.58)',
        boxShadow: '0 0 16px rgba(200, 164, 106, 0.18)',
      } : {}}
    >
      <ActionIcon name="pin" size={20} />
    </button>
  );
}

function LoadingView() {
  return <div className="view-loading">加载中...</div>;
}

function AppContent() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [recordLocationId, setRecordLocationId] = useState(null);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [panelInitialPage, setPanelInitialPage] = useState(0);
  const [journeyBrowseState, setJourneyBrowseState] = useState(null);
  const [journeyReturnActive, setJourneyReturnActive] = useState(false);
  const [previewCityId, setPreviewCityId] = useState(null);
  const {
    viewMode,
    setViewMode,
    panelOpen,
    closePanel,
    openLocation,
    locations,
    selectedId,
    storageReady,
  } = useTravel();
  const handleJourneyBrowseStateChange = useCallback((nextState) => {
    setJourneyBrowseState((current) => (
      current?.locationId === nextState.locationId
      && current?.tripId === nextState.tripId
      && current?.railOffset === nextState.railOffset
        ? current
        : nextState
    ));
  }, []);

  useEffect(() => {
    if (panelOpen || viewMode !== 'earth') setPreviewCityId(null);
  }, [panelOpen, viewMode]);

  if (!storageReady) return <LoadingView />;

  const handleCitySelect = (location) => {
    const defaultTrip = getDefaultTrip(location);
    setPreviewCityId(null);
    setSelectedTripId(defaultTrip?.id || null);
    setPanelInitialPage(0);
    setJourneyReturnActive(false);
    openLocation(location.id);
  };
  const handleRecordVisit = (locationId) => {
    setRecordLocationId(locationId);
    setShowAddForm(true);
  };
  const handlePanelBack = () => {
    if (journeyReturnActive) {
      setJourneyReturnActive(false);
      closePanel();
      setViewMode('timeline');
      return;
    }
    closePanel();
  };
  const handleJourneyTripSelect = (ticket) => {
    if (!ticket?.location?.id || !ticket?.trip?.id) return;
    setPreviewCityId(null);
    setSelectedTripId(ticket.trip.id);
    setPanelInitialPage(1);
    setJourneyReturnActive(true);
    setViewMode('earth');
    openLocation(ticket.location.id);
  };
  const handleTripCreated = ({ locationId, tripId }) => {
    if (!locationId || !tripId) return;
    setShowAddForm(false);
    setRecordLocationId(null);
    setPreviewCityId(null);
    setSelectedTripId(tripId);
    setPanelInitialPage(1);
    setJourneyReturnActive(false);
    setViewMode('earth');
    openLocation(locationId);
  };
  if (viewMode === 'timeline') {
    return (
      <div className="app">
        <TimelineErrorBoundary onBack={() => setViewMode('earth')}>
          <TimeJourney
            onBack={() => setViewMode('earth')}
            onStartRecord={() => { setViewMode('earth'); setRecordLocationId(null); setShowAddForm(true); }}
            onOpenTrip={handleJourneyTripSelect}
            browseState={journeyBrowseState}
            onBrowseStateChange={handleJourneyBrowseStateChange}
          />
        </TimelineErrorBoundary>
      </div>
    );
  }

  return (
    <div className={'app app--' + GLOBE_STYLE}>
      <Suspense fallback={<LoadingView />}>
        {viewMode === 'earth' ? (
          <GlobeScene onSelectCity={handleCitySelect} onPreviewChange={setPreviewCityId} />
        ) : <SolarScene />}
      </Suspense>

      {viewMode === 'earth' && (
        <>
          <TopNav onStartRecord={() => { setRecordLocationId(null); setShowAddForm(true); }} />
          <HeroSection onStartRecord={() => { setRecordLocationId(null); setShowAddForm(true); }} />
          <AnimatePresence initial={false}>
            {!panelOpen && previewCityId && (
              <Suspense fallback={null}>
                <GlobeCityPanel key={previewCityId} locationId={previewCityId} />
              </Suspense>
            )}
          </AnimatePresence>
          <Suspense fallback={null}>
            <LocationPanel
              key={`${selectedId ?? 'none'}:${selectedTripId ?? 'none'}:${panelInitialPage}`}
              initialTripId={selectedTripId}
              initialPage={panelInitialPage}
              onBack={handlePanelBack}
              backLabel={journeyReturnActive ? '返回时间旅途' : '返回地球'}
              onRecordVisit={handleRecordVisit}
            />
          </Suspense>
          {!panelOpen && (
            <>
              <FootprintToggle />
              <MobileNav onStartRecord={() => { setRecordLocationId(null); setShowAddForm(true); }} />
            </>
          )}
          <Suspense fallback={null}>
            <BgMusicPlayer />
          </Suspense>
        </>
      )}

      {viewMode === 'solar' && <ViewToggle />}

      {showAddForm && (
        <Suspense fallback={null}>
          <AddLocationForm
            initialLocation={locations.find((location) => location.id === recordLocationId) || null}
            onClose={() => { setShowAddForm(false); setRecordLocationId(null); }}
            onTripCreated={handleTripCreated}
          />
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.DEV || mountedRef.current) return;
    mountedRef.current = true;
    performance.mark('travel-memory:app-mounted');
    const measure = performance.measure(
      'travel-memory:app-mount',
      'travel-memory:app-start',
      'travel-memory:app-mounted',
    );
    console.info('[Travel Memory performance] App mounted', {
      durationMs: Math.round(measure.duration),
    });
  }, []);

  return (
    <AppErrorBoundary>
      <TravelProvider>
        <AppContent />
      </TravelProvider>
    </AppErrorBoundary>
  );
}


