import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { useTravel } from '../context/TravelContext';
import cityLandmarks, { DEFAULT_LANDMARK } from '../data/cityLandmarks';
import LocationPhotoWall from './LocationPhotoWall';
import { readImageMetadata } from '../utils/imageMetadata';
import { getPhotoFallbackUrl, getPhotoKey, usePhotoObjectUrl } from '../storage/usePhotoObjectUrl';
import { formatTripDateRange, getTripPhotoCount, getTripPhotos, sortTripsByLatestStart } from '../utils/tripSelection';
import { getSaveStatusPresentation } from '../utils/saveStatusPresentation';
import ActionIcon from './ActionIcon';
import ConfirmDialog from './ConfirmDialog';

const ItineraryFilmView = lazy(() => import('./ItineraryFilmView'));

function LocationLightboxImage({ photo, alt }) {
  const src = usePhotoObjectUrl(photo);
  return (
    <motion.img
      key={getPhotoKey(photo)}
      src={src || undefined}
      alt={alt}
      className="mp-lightbox-img"
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

function TripArchiveCover({ trip, cityName }) {
  const coverPhoto = trip.coverPhoto || getTripPhotos(trip)[0] || null;
  const src = usePhotoObjectUrl(coverPhoto);
  return (
    <span className="city-trip-archive-card__cover" aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" /> : <span>NO COVER</span>}
      <small>{cityName}</small>
    </span>
  );
}

function compressImageFile(file, maxWidth = 1200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxWidth / image.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('当前浏览器无法处理这张图片'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob) {
          reject(new Error('图片压缩失败'));
          return;
        }
        resolve({ blob, width: canvas.width, height: canvas.height });
      }, 'image/jpeg', quality);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片读取失败，请换一张图片'));
    };
    image.src = objectUrl;
  });
}

export default function LocationPanel({ initialTripId = null, initialPage = 0, onBack, onRecordVisit, backLabel = '返回地球' }) {
  const reducedMotion = useReducedMotion();
  const {
    locations,
    selectedId,
    panelOpen,
    closePanel,
    updateLocation,
    deleteLocation,
    addLandscapeImage,
    replaceLandscapeImage,
    flushStorage,
    saveState,
    storageStatus,
  } = useTravel();
  const location = locations.find((item) => item.id === selectedId);
  const fileRef = useRef(null);
  const containerRef = useRef(null);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [filmTripId, setFilmTripId] = useState(initialTripId);
  const [overviewUndo, setOverviewUndo] = useState(null);
  const [uploadFeedback, setUploadFeedback] = useState(null);
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [uploading, setUploading] = useState(false);
  const uploadBusyRef = useRef(false);

  useEffect(() => {
    if (!panelOpen) return;
    setCurrentPage(initialPage);
    setFilmTripId(initialTripId);
    setLightboxIdx(null);
    setOverviewUndo(null);
    const galleryPage = containerRef.current?.querySelector('.mp-swipe-page');
    if (galleryPage) galleryPage.scrollTop = 0;
  }, [initialPage, initialTripId, panelOpen, selectedId]);

  useEffect(() => {
    if (!uploadFeedback || uploadFeedback.failures.length || uploading) return undefined;
    const timer = window.setTimeout(() => setUploadFeedback((current) => current === uploadFeedback ? null : current), 2800);
    return () => window.clearTimeout(timer);
  }, [uploadFeedback, uploading]);

  if (!location) return null;

  const savePresentation = getSaveStatusPresentation(saveState, storageStatus);
  const landmark = cityLandmarks[location.name] || DEFAULT_LANDMARK;
  const archiveTrips = sortTripsByLatestStart(location);
  const archivePhotoCount = archiveTrips.reduce((count, trip) => count + getTripPhotoCount(trip), 0);
  const storedImages = Array.isArray(location.landscapeImages) ? location.landscapeImages : [];
  const storedImageMeta = Array.isArray(location.landscapeImageMeta) ? location.landscapeImageMeta : [];
  const hiddenOverviewImages = Array.isArray(location.overviewHiddenImages)
    ? location.overviewHiddenImages
      .map((item) => typeof item === 'string'
        ? { url: item, sourceIndex: null }
        : { ...item, url: item?.url || '', sourceIndex: Number.isInteger(item?.sourceIndex) ? item.sourceIndex : null })
      .filter((item) => item.url || item.assetId || item.id)
    : [];
  const isOverviewHidden = (entry) => hiddenOverviewImages.some((item) => (
    getPhotoKey(item) === getPhotoKey(entry.photo) &&
    (item.sourceIndex === null || item.sourceIndex === entry.sourceIndex)
  ));
  const visibleEntries = storedImages
    .map((photo, sourceIndex) => ({ photo, sourceIndex }))
    .filter((entry) => entry.photo && !isOverviewHidden(entry));
  const images = visibleEntries.map((entry) => entry.photo);
  const imageSlots = visibleEntries.map((entry, index) => ({ photo: entry.photo, index, sourceIndex: entry.sourceIndex }));
  const galleryMinHeight = Math.max(940, 980 + Math.max(0, images.length - 6) * 180);
  const processOverviewFiles = async (files, previous = { successCount: 0, failures: [] }) => {
    if (uploadBusyRef.current || !files.length) return;
    uploadBusyRef.current = true;
    setUploading(true);
    let successCount = previous.successCount;
    const failures = [...previous.failures];
    try {
      for (const file of files) {
        let stage = 'processing';
        try {
          const [compressed, metadata] = await Promise.all([
            compressImageFile(file),
            readImageMetadata(file),
          ]);
          stage = 'saving';
          const saved = await addLandscapeImage(location.id, { ...compressed, ...metadata }, metadata);
          if (saved === false) throw new Error('照片尚未保存');
          successCount += 1;
        } catch (error) {
          failures.push({ file, stage });
          console.warn('[TravelMemory] 地点照片上传失败', error);
        }
      }
      setUploadFeedback({ locationId: location.id, successCount, failures });
    } finally {
      uploadBusyRef.current = false;
      setUploading(false);
    }
  };

  const handleUpload = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setUploadFeedback(null);
    void processOverviewFiles(files);
  };

  const retryFailedUpload = async () => {
    if (!uploadFeedback || uploadFeedback.locationId !== location.id || uploadBusyRef.current) return;
    uploadBusyRef.current = true;
    setUploading(true);
    const savingFailures = uploadFeedback.failures.filter((item) => item.stage === 'saving');
    const processingFailures = uploadFeedback.failures.filter((item) => item.stage === 'processing');
    let successCount = uploadFeedback.successCount;
    let failures = [...savingFailures];
    try {
      if (savingFailures.length) {
        const saved = await flushStorage();
        if (saved !== false) {
          successCount += savingFailures.length;
          failures = [];
        }
      }
    } catch (error) {
      console.warn('[TravelMemory] 地点照片重试保存失败', error);
    } finally {
      uploadBusyRef.current = false;
      setUploading(false);
    }
    if (processingFailures.length) {
      await processOverviewFiles(processingFailures.map((item) => item.file), { successCount, failures });
    } else {
      setUploadFeedback({ locationId: location.id, successCount, failures });
    }
  };

  const handleCoverUpload = async (index, file) => {
    const [compressed, metadata] = await Promise.all([
      compressImageFile(file),
      readImageMetadata(file),
    ]);
    const entry = visibleEntries[index];
    if (!entry) {
      const saved = await addLandscapeImage(location.id, { ...compressed, ...metadata }, metadata);
      if (saved === false) throw new Error('照片保存失败，请重试');
      return;
    }
    const saved = await replaceLandscapeImage(location.id, entry.sourceIndex, { ...compressed, ...metadata }, metadata);
    if (saved === false) throw new Error('照片保存失败，请重试');
  };

  const handleCoverRemove = (index) => {
    const entry = visibleEntries[index];
    if (!entry) return;
    const marker = { ...entry.photo, url: getPhotoFallbackUrl(entry.photo), sourceIndex: entry.sourceIndex };
    const nextHidden = hiddenOverviewImages.some((item) => (
      getPhotoKey(item) === getPhotoKey(marker) && item.sourceIndex === marker.sourceIndex
    ))
      ? hiddenOverviewImages
      : [...hiddenOverviewImages, marker];
    updateLocation(location.id, { overviewHiddenImages: nextHidden });
    setLightboxIdx(null);
    setOverviewUndo(marker);
  };

  const handleOverviewUndo = () => {
    if (!overviewUndo) return;
    updateLocation(location.id, {
      overviewHiddenImages: hiddenOverviewImages.filter((item) => !(
        getPhotoKey(item) === getPhotoKey(overviewUndo) &&
        (overviewUndo.sourceIndex === null || item.sourceIndex === overviewUndo.sourceIndex)
      )),
    });
    setOverviewUndo(null);
  };

  const handleCoverOpen = (slotIndex) => {
    const index = imageSlots.findIndex((slot) => slot.index === slotIndex);
    if (index >= 0) setLightboxIdx(index);
  };
  return (
    <AnimatePresence>
      {panelOpen && (
        <motion.div
          className="location-panel"
          initial={{ opacity: 0, x: '100%' }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: '100%' }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <nav className={"mp-nav " + (currentPage === 1 ? "is-journey" : "is-overview")}>
            <button className="mp-nav-back" onClick={onBack || closePanel} aria-label={backLabel} title={backLabel}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="mp-nav-center" aria-label="地点页面导航">
              <button type="button" className={'mp-nav-link ' + (currentPage === 0 ? 'active' : '')} onClick={() => setCurrentPage(0)}>概览</button>
              <span className="mp-nav-divider" />
              <button type="button" className={'mp-nav-link ' + (currentPage === 1 ? 'active' : '')} onClick={() => setCurrentPage(1)}>行程</button>
            </div>
            {currentPage === 0 && (
              <button className="mp-nav-upload" onClick={() => fileRef.current?.click()} aria-label="添加照片" title="添加照片" disabled={uploading}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                添加照片
              </button>
            )}
            {uploadFeedback?.locationId === location.id && (
              <div className="location-upload-feedback" role={uploadFeedback.failures.length ? 'alert' : 'status'}>
                <strong>已保存 {uploadFeedback.successCount} 张 · 失败 {uploadFeedback.failures.length} 张</strong>
                {uploadFeedback.failures.length > 0 && (
                  <>
                    <ul>{uploadFeedback.failures.map((item, index) => <li key={`${item.file.name}-${index}`}>{item.file.name}：{item.stage === 'saving' ? '保存未完成' : '图片处理失败'}</li>)}</ul>
                    <button type="button" onClick={retryFailedUpload} disabled={uploading}>{uploading ? '重试中…' : '重试失败项'}</button>
                  </>
                )}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={handleUpload} disabled={uploading} />
          </nav>

          <LayoutGroup id={'memory-gallery-' + (selectedId || 'idle')}>
            <motion.div ref={containerRef} className="mp-swipe-container">
              <AnimatePresence initial={false} custom={currentPage} mode="popLayout">
                {currentPage === 0 ? (
                  <motion.div
                    key="gallery"
                    className="mp-swipe-page"
                    custom={0}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.28 }}
                  >
                    <div className="mp-gallery" style={{ minHeight: galleryMinHeight + 'px' }}>
                      <LocationPhotoWall
                        locationId={location.id}
                        locationName={location.name}
                        locationDescription={landmark.desc}
                        travelLabel={location.travelMethod ? ({ plane: 'FLIGHT', train: 'RAIL', car: 'ROAD', walk: 'WALK', bike: 'RIDE' }[location.travelMethod] || 'PERSONAL ARCHIVE') : 'PERSONAL ARCHIVE'}
                        images={images}
                        imageMeta={visibleEntries.map((entry) => storedImageMeta[entry.sourceIndex] || null)}
                        onOpen={handleCoverOpen}
                        onUpload={handleCoverUpload}
                        onRemove={handleCoverRemove}
                      />
                      <section className="city-trip-archive" aria-labelledby="city-trip-archive-title">
                        <header className="city-trip-archive__header">
                          <div>
                            <span className="city-trip-archive__eyebrow">CITY ARCHIVE / VISITS</span>
                            <h2 id="city-trip-archive-title">{location.name} · 旅行档案</h2>
                            <p>{archiveTrips.length} 次旅行 <span aria-hidden="true">·</span> {archivePhotoCount} 张照片</p>
                            {savePresentation && (
                              <div className={'city-trip-archive__save-state is-' + saveState.status} role={saveState.status === 'error' ? 'alert' : 'status'}>
                                <span>{savePresentation.label}</span>
                                {savePresentation.retryLabel && <button type="button" onClick={() => { void flushStorage(); }}>{savePresentation.retryLabel}</button>}
                              </div>
                            )}
                          </div>
                          <button type="button" className="city-trip-archive__add" onClick={() => onRecordVisit?.(location.id)}>
                            <ActionIcon name="plus" size={16} />记录一次到访
                          </button>
                        </header>
                        {archiveTrips.length ? (
                          <div className="city-trip-archive__list">
                            {archiveTrips.map((trip) => (
                              <button
                                type="button"
                                key={trip.id}
                                className="city-trip-archive-card"
                                onClick={() => { setFilmTripId(trip.id); setCurrentPage(1); }}
                                aria-label={`打开${location.name}的${trip.name || '旅行'}，${formatTripDateRange(trip)}`}
                              >
                                <TripArchiveCover trip={trip} cityName={location.name} />
                                <span className="city-trip-archive-card__copy">
                                  <span className="city-trip-archive-card__date">{formatTripDateRange(trip)}</span>
                                  <strong>{trip.name || location.name + '之旅'}</strong>
                                  <small>{getTripPhotoCount(trip)} 张照片</small>
                                </span>
                                <span className="city-trip-archive-card__arrow" aria-hidden="true">↗</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="city-trip-archive__empty">还没有这座城市的旅行记录，从一次到访开始。</p>
                        )}
                      </section>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="itinerary"
                    className="mp-swipe-page mp-swipe-page-scroll itinerary-swipe-page"
                    custom={1}
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                    transition={{ duration: reducedMotion ? 0.01 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Suspense fallback={<div className="view-loading itinerary-film-loading">LOADING FILM...</div>}><ItineraryFilmView location={location} initialTripId={filmTripId} /></Suspense>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </LayoutGroup>

          <AnimatePresence>
            {lightboxIdx !== null && (
              <motion.div className="mp-lightbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLightboxIdx(null)}>
                <button className="mp-lightbox-close" onClick={() => setLightboxIdx(null)} aria-label="关闭照片"><ActionIcon name="close" size={20} /></button>
                <button className="mp-lightbox-del" onClick={(event) => { event.stopPropagation(); handleCoverRemove(imageSlots[lightboxIdx]?.index); }} aria-label="删除照片">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                  删除
                </button>
                {imageSlots.length > 1 && (
                  <>
                    <button className="mp-lb-arrow mp-lb-prev" onClick={(event) => { event.stopPropagation(); setLightboxIdx((lightboxIdx - 1 + imageSlots.length) % imageSlots.length); }} aria-label="上一张">‹</button>
                    <button className="mp-lb-arrow mp-lb-next" onClick={(event) => { event.stopPropagation(); setLightboxIdx((lightboxIdx + 1) % imageSlots.length); }} aria-label="下一张">›</button>
                  </>
                )}
                <LocationLightboxImage photo={imageSlots[lightboxIdx]?.photo} alt={location.name + '旅行照片'} />
                {imageSlots.length > 1 && (
                  <div className="mp-lb-dots">
                    {imageSlots.map((_, index) => <button type="button" key={index} className={'mp-lb-dot ' + (index === lightboxIdx ? 'active' : '')} onClick={(event) => { event.stopPropagation(); setLightboxIdx(index); }} aria-label={'第 ' + (index + 1) + ' 张'} />)}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {overviewUndo && (
            <div className="location-overview-undo" role="status" aria-live="polite">
              <span>已从概览移除</span>
              <button type="button" onClick={handleOverviewUndo}>撤销</button>
            </div>
          )}

          <div className="mp-page-indicator" aria-label="概览与行程切换">
            <button type="button" className={'mp-dot ' + (currentPage === 0 ? 'active' : '')} onClick={() => setCurrentPage(0)} aria-label="概览" />
            <button type="button" className={'mp-dot ' + (currentPage === 1 ? 'active' : '')} onClick={() => setCurrentPage(1)} aria-label="行程" />
          </div>

          <button
            type="button"
            className="location-delete-fab"
            onClick={(event) => setDeleteRequest({ returnFocusTarget: event.currentTarget, locationId: location.id, locationName: location.name })}
            aria-label="删除地点"
            title="删除地点"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13M10 11v5M14 11v5" />
            </svg>
          </button>
          {deleteRequest && (
            <ConfirmDialog
              theme="paper"
              title="删除城市档案"
              description={`确认删除「${deleteRequest.locationName}」的城市档案？此操作无法撤销。`}
              confirmLabel="删除城市"
              returnFocusTarget={deleteRequest.returnFocusTarget}
              fallbackFocusSelector=".top-nav .nav-link, .mobile-nav__item, .mp-nav-back"
              onCancel={() => setDeleteRequest(null)}
              onConfirm={() => { deleteLocation(deleteRequest.locationId); setDeleteRequest(null); }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
