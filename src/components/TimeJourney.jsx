import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTravel } from '../context/TravelContext';
import { CITY_SKETCH_CONFIG } from '../config/timeJourneyCitySketches';
import { getCityAttractionSketches } from '../config/timeJourneyAttractionSketches';
import { inclusiveCalendarDayCount, parseCalendarDate } from '../utils/calendarDate';
import { usePhotoObjectUrl } from '../storage/usePhotoObjectUrl';
import { getRuntimeAssetUrl } from '../storage/travelDb';
import MiniTicketRail from './MiniTicketRail';
import ActionIcon from './ActionIcon';
import { getSaveStatusPresentation } from '../utils/saveStatusPresentation';

const CITY_ENGLISH_NAMES = {
  北京: 'BEIJING', 上海: 'SHANGHAI', 广州: 'GUANGZHOU', 深圳: 'SHENZHEN',
  成都: 'CHENGDU', 杭州: 'HANGZHOU', 南京: 'NANJING', 武汉: 'WUHAN',
  西安: 'XI AN', 长沙: 'CHANGSHA', 厦门: 'XIAMEN', 昆明: 'KUNMING',
  丽江: 'LIJIANG', 三亚: 'SANYA', 拉萨: 'LHASA', 哈尔滨: 'HARBIN',
  青岛: 'QINGDAO', 桂林: 'GUILIN', 苏州: 'SUZHOU', 贵阳: 'GUIYANG',
  遵义: 'ZUNYI', 泉州: 'QUANZHOU', 香港: 'HONG KONG', 澳门: 'MACAU',
  天津: 'TIANJIN', 重庆: 'CHONGQING', 珠海: 'ZHUHAI', 佛山: 'FOSHAN',
  东莞: 'DONGGUAN', 福州: 'FUZHOU', 郑州: 'ZHENGZHOU', 合肥: 'HEFEI',
  南昌: 'NANCHANG', 贵州: 'GUIZHOU', 太原: 'TAIYUAN', 海口: 'HAIKOU', 兰州: 'LANZHOU',
};

const TICKET_PALETTES = [
  { paper: '#f5eee1', wash: '#dce9ee', accent: '#668b9b', ink: '#273c45' },
  { paper: '#f3eadc', wash: '#e5dfd1', accent: '#9a8063', ink: '#483a31' },
  { paper: '#f0ebe4', wash: '#dce4e0', accent: '#718a83', ink: '#31423f' },
  { paper: '#f6efe6', wash: '#e8dce0', accent: '#9d7180', ink: '#46363b' },
];

function getPhotoUrl(photo) {
  if (typeof photo === 'string') return photo;
  return photo?.url || photo?.src || photo?.dataUrl || photo?.sourceUrl || '';
}

function normalizePhoto(photo, index, source = 'trip') {
  const url = getPhotoUrl(photo);
  const id = typeof photo === 'object' ? (photo.assetId || photo.id || '') : '';
  if (!url && !id) return null;
  return {
    ...(typeof photo === 'object' ? photo : {}),
    id: id || `${source}-${index}-${url.slice(-24)}`,
    url,
  };
}

function getTripPhotos(trip) {
  const centralPhotos = (Array.isArray(trip?.photos) ? trip.photos : [])
    .map((photo, index) => normalizePhoto(photo, index, 'trip'))
    .filter(Boolean);
  const legacyPhotos = (trip?.days || []).flatMap((day) => (day.blocks || []).flatMap((block) => {
    if (block.type === 'photos') return block.data?.photos || [];
    if (block.type !== 'itinerary') return [];
    return (block.data?.slots || []).flatMap((slot) => (
      ['breakfast', 'lunch', 'dinner'].map((key) => slot?.[key]).filter(Boolean)
    ));
  })).map((photo, index) => normalizePhoto(photo, index, 'legacy')).filter(Boolean);

  const seen = new Set();
  return [...centralPhotos, ...legacyPhotos].filter((photo) => {
    const key = photo.id || photo.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseTripDate(value) {
  const date = parseCalendarDate(value);
  return date ? date.getTime() : null;
}

function formatDate(value) {
  return value ? String(value).replace(/-/g, '.') : '日期待定';
}

function formatMonthYear(value) {
  const timestamp = parseTripDate(value);
  if (timestamp === null) return 'DATE TBD';
  const date = new Date(timestamp);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateRange(trip) {
  const start = formatDate(trip?.startDate);
  const end = trip?.endDate && trip.endDate !== trip.startDate ? formatDate(trip.endDate) : '';
  return end ? `${start} — ${end}` : start;
}

function getDateRangeParts(trip) {
  return {
    start: formatDate(trip?.startDate),
    end: trip?.endDate && trip.endDate !== trip.startDate ? formatDate(trip.endDate) : '',
  };
}

function getCityDisplayLines(cityName) {
  const normalized = String(cityName || '').trim().toUpperCase();
  if (!normalized) return ['TRAVEL'];
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 1) return words;
  if (normalized.endsWith('ZHOU') && normalized.length > 7) {
    return [normalized.slice(0, -4), 'ZHOU'];
  }
  return [normalized];
}

function getDaysCount(trip) {
  const count = inclusiveCalendarDayCount(trip?.startDate, trip?.endDate || trip?.startDate);
  if (count !== null) return count;
  return Array.isArray(trip?.days) && trip.days.length ? trip.days.length : 0;
}

function getCityEnglishName(name) {
  return CITY_ENGLISH_NAMES[name] || String(name || 'TRAVEL').toUpperCase();
}

function normalizeSketchAlias(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '-');
}

function getCitySketchConfig(ticket) {
  const candidates = [
    ticket?.cityId,
    ticket?.location?.cityId,
    ticket?.location?.id,
    ticket?.location?.name,
    getCityEnglishName(ticket?.location?.name),
  ].map(normalizeSketchAlias).filter(Boolean);

  const configured = Object.values(CITY_SKETCH_CONFIG).find((config) => (
    config.aliases.some((alias) => candidates.includes(normalizeSketchAlias(alias)))
  ));
  if (configured) return configured;

  const cityName = ticket?.location?.name;
  if (!getCityAttractionSketches(cityName).length) return null;
  return {
    aliases: [cityName],
    src: getCityAttractionSketches(cityName)[0].src,
    width: 'clamp(300px, 32vw, 620px)',
    maxWidth: '620px',
    opacity: 0.22,
    left: '-3vw',
    bottom: '4%',
    translateX: '0px',
    translateY: '0px',
    anchorX: 'left',
    anchorY: 'bottom',
    rotation: -1.2,
    contrast: 1.08,
    ambientTint: '#c8d3d2',
  };
}

function getTicketPalette(index) {
  return TICKET_PALETTES[index % TICKET_PALETTES.length];
}

function clampPhotoPosition(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(10, Math.min(90, number)) : 50;
}

function getPhotoPosition(trip) {
  const position = trip?.ticketPhotoPosition || {};
  return {
    x: clampPhotoPosition(position.x),
    y: clampPhotoPosition(position.y),
  };
}

function photoPositionToCss(position) {
  return `${position.x}% ${position.y}%`;
}

function getAutomaticPhotoPosition(width, height) {
  const aspectRatio = width > 0 && height > 0 ? width / height : 1;
  if (aspectRatio >= 2.1) return { x: 50, y: 58 };
  if (aspectRatio >= 1.35) return { x: 50, y: 52 };
  return { x: 50, y: 50 };
}

function compressTicketCover(file, maxWidth = 1800) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);

    image.onload = async () => {
      try {
        const scale = Math.min(1, maxWidth / image.naturalWidth);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('无法创建票根封面画布');
        context.drawImage(image, 0, 0, width, height);
        const blob = await new Promise((resolveBlob, rejectBlob) => {
          canvas.toBlob((value) => {
            if (value) resolveBlob(value);
            else rejectBlob(new Error('当前浏览器无法生成票根封面'));
          }, 'image/jpeg', 0.88);
        });
        cleanup();
        resolve({ blob, width, height });
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('票根封面读取失败'));
    };
    image.src = objectUrl;
  });
}

function sortJourneyTrips(locations) {
  return (locations || []).flatMap((location, locationIndex) => (
    (Array.isArray(location.trips) ? location.trips : []).map((trip, tripIndex) => {
      const photos = getTripPhotos(trip);
      const configuredCover = normalizePhoto(
        trip.coverPhoto || trip.coverPhotoUrl || trip.cover?.url,
        0,
        'cover',
      );
      return {
        id: `${location.id}-${trip.id}`,
        cityId: location.cityId || location.id || location.name,
        location,
        trip,
        photos,
        coverPhoto: configuredCover || photos[0] || normalizePhoto(location.landscapeImages?.[0], 0, 'location') || null,
        hasCustomCover: Boolean(configuredCover),
        photoPosition: getPhotoPosition(trip),
        timestamp: parseTripDate(trip.startDate),
        sourceOrder: locationIndex * 10000 + tripIndex,
      };
    })
  )).sort((a, b) => {
    if (a.timestamp !== null && b.timestamp !== null && a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (a.timestamp !== null && b.timestamp === null) return -1;
    if (a.timestamp === null && b.timestamp !== null) return 1;
    return a.sourceOrder - b.sourceOrder;
  }).map((ticket, index) => ({
    ...ticket,
    sequence: index + 1,
    palette: getTicketPalette(index),
  }));
}

function getYearMarks(tickets) {
  const years = [...new Set(tickets
    .map((ticket) => ticket.timestamp === null ? null : new Date(ticket.timestamp).getFullYear())
    .filter(Boolean))];
  if (years.length <= 5) return years;
  return [years[0], years[Math.floor(years.length / 2)], years[years.length - 1]];
}

function getTimelinePosition(ticket, tickets) {
  const valid = tickets.filter((item) => item.timestamp !== null);
  if (ticket.timestamp === null) {
    const fallbackIndex = tickets.indexOf(ticket);
    return tickets.length > 1 ? (fallbackIndex / (tickets.length - 1)) * 100 : 50;
  }
  if (valid.length < 2) return 50;
  const min = valid[0].timestamp;
  const max = valid[valid.length - 1].timestamp;
  return ((ticket.timestamp - min) / Math.max(1, max - min)) * 100;
}

function PaperPlane() {
  return (
    <svg className="ticket-time-ruler__plane" viewBox="0 0 56 38" aria-hidden="true">
      <path d="M4 19 51 4 31 34 25 22 4 19Z" />
      <path d="m25 22 26-18-20 30" />
      <path d="m25 22-1 12" />
    </svg>
  );
}

function TicketCard({ ticket, stackIndex, direction, reducedMotion, onOpen, onUpload, onRetrySave, onRemove, onSavePosition }) {
  const isCurrent = stackIndex === 0;
  const offset = [0, 16, 28][stackIndex] || 28;
  const scale = [1, 0.968, 0.938][stackIndex] || 0.938;
  const opacity = [1, 0.82, 0.62][stackIndex] || 0.62;
  const rotate = [0, 0.35, -0.45][stackIndex] || -0.45;
  const days = getDaysCount(ticket.trip);
  const englishName = getCityEnglishName(ticket.location.name);
  const cityDisplayLines = getCityDisplayLines(englishName);
  const dateParts = getDateRangeParts(ticket.trip);
  const photoRef = useRef(null);
  const dragRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [draftPosition, setDraftPosition] = useState(ticket.photoPosition);
  const ticketPositionX = ticket.photoPosition.x;
  const ticketPositionY = ticket.photoPosition.y;
  const coverUrl = usePhotoObjectUrl(ticket.coverPhoto);

  useEffect(() => {
    setDraftPosition({ x: ticketPositionX, y: ticketPositionY });
    setIsAdjusting(false);
  }, [ticket.id, ticketPositionX, ticketPositionY]);

  useEffect(() => {
    setUploadFeedback(null);
  }, [ticket.id]);

  useEffect(() => {
    if (uploadFeedback?.status !== 'success') return undefined;
    const timer = window.setTimeout(() => setUploadFeedback(null), 2800);
    return () => window.clearTimeout(timer);
  }, [uploadFeedback?.status]);

  const uploadCover = async (file, retrySaving = false) => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadFeedback(null);
    let stage = retrySaving ? 'saving' : 'processing';
    try {
      if (retrySaving) {
        const saved = await onRetrySave();
        if (saved === false) throw new Error('票根封面尚未保存');
      } else {
        const prepared = await compressTicketCover(file);
        const id = `ticket-cover-${Date.now().toString(36)}`;
        stage = 'saving';
        const saved = await onUpload(ticket, {
          id,
          assetId: id,
          blob: prepared.blob,
          url: getRuntimeAssetUrl(id, prepared.blob),
          fileName: file.name,
          width: prepared.width,
          height: prepared.height,
        }, getAutomaticPhotoPosition(prepared.width, prepared.height));
        if (saved === false) throw new Error('票根封面尚未保存');
      }
      setUploadFeedback({ status: 'success' });
    } catch (error) {
      console.warn('[TravelMemory] 票根封面上传失败', error);
      setUploadFeedback({ status: 'error', stage, file });
    } finally {
      setUploading(false);
    }
  };

  const activePosition = isAdjusting ? draftPosition : ticket.photoPosition;
  const style = {
    '--ticket-paper': ticket.palette.paper,
    '--ticket-wash': ticket.palette.wash,
    '--ticket-accent': ticket.palette.accent,
    '--ticket-ink': ticket.palette.ink,
    '--ticket-stub-bg': ticket.trip.ticketStubColor || '#234751',
    '--ticket-stub-text': '#f1ecdf',
    '--ticket-stub-muted': 'rgba(241,236,223,0.72)',
    '--ticket-stub-accent': '#e5c98f',
    '--ticket-photo-position': photoPositionToCss(activePosition),
    zIndex: 10 - stackIndex,
  };

  const beginPhotoDrag = (event) => {
    if (!isCurrent || !isAdjusting || event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: draftPosition,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const movePhotoDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = photoRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    setDraftPosition({
      x: clampPhotoPosition(drag.startPosition.x + ((event.clientX - drag.startX) / bounds.width) * 100),
      y: clampPhotoPosition(drag.startPosition.y + ((event.clientY - drag.startY) / bounds.height) * 100),
    });
  };

  const endPhotoDrag = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const startAdjusting = (event) => {
    event.stopPropagation();
    setDraftPosition(ticket.photoPosition);
    setIsAdjusting(true);
  };

  const finishAdjusting = (event) => {
    event.stopPropagation();
    onSavePosition(ticket, draftPosition);
    setIsAdjusting(false);
  };

  const cancelAdjusting = (event) => {
    event.stopPropagation();
    setDraftPosition(ticket.photoPosition);
    setIsAdjusting(false);
  };

  const nudgePosition = (event) => {
    if (!isAdjusting) return;
    const increments = {
      ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2],
    };
    const increment = increments[event.key];
    if (!increment) return;
    event.preventDefault();
    setDraftPosition((position) => ({
      x: clampPhotoPosition(position.x + increment[0]),
      y: clampPhotoPosition(position.y + increment[1]),
    }));
  };

  return (
    <motion.div
      className={`ticket-card${isCurrent ? ' is-current' : ' is-stack-layer'}${ticket.coverPhoto ? ' has-cover' : ' no-cover'}${isAdjusting ? ' is-adjusting' : ''}`}
      style={style}
      aria-hidden={!isCurrent}
      role={isCurrent ? 'button' : undefined}
      tabIndex={isCurrent ? 0 : -1}
      aria-label={isCurrent ? `打开${ticket.location.name}的旅行记录` : undefined}
      onClick={isCurrent && !isAdjusting ? (event) => {
        const target = event.target;
        const clickedControl = target !== event.currentTarget
          && target.closest?.('button, input, label, a');
        if (clickedControl) return;
        onOpen(ticket);
      } : undefined}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (isAdjusting) {
          nudgePosition(event);
          return;
        }
        if (!isCurrent || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onOpen(ticket);
      }}
      initial={reducedMotion ? false : {
        y: direction > 0 ? 26 : -26,
        scale: 0.975,
        rotate: direction > 0 ? 0.5 : -0.5,
        opacity: 0,
      }}
      animate={{ y: offset, scale, rotate, opacity }}
      whileHover={isCurrent && !isAdjusting && !reducedMotion ? { y: offset - 3, scale: 1.008, transition: { duration: 0.18 } } : undefined}
      whileTap={isCurrent && !isAdjusting && !reducedMotion ? { y: offset - 1, scale: 0.995, transition: { duration: 0.1 } } : undefined}
      exit={reducedMotion ? undefined : {
        y: direction > 0 ? -30 : 30,
        scale: 0.975,
        rotate: direction > 0 ? -0.5 : 0.5,
        opacity: 0,
      }}
      transition={{ duration: reducedMotion ? 0.01 : 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <span
        className={`ticket-card__photo${isAdjusting ? ' is-adjusting' : ''}`}
        ref={photoRef}
        onPointerDown={beginPhotoDrag}
        onPointerMove={movePhotoDrag}
        onPointerUp={endPhotoDrag}
        onPointerCancel={endPhotoDrag}
      >
        {ticket.coverPhoto ? (coverUrl ? <img src={coverUrl} alt={`${ticket.location.name}旅行封面`} /> : <span className="ticket-card__photo-empty">LOADING COVER</span>) : <span className="ticket-card__photo-empty">NO COVER PHOTO</span>}
        {isCurrent && ticket.coverPhoto && isAdjusting && <span className="ticket-card__adjust-hint">DRAG TO REPOSITION</span>}
        {isCurrent && (
          <span className="ticket-card__photo-actions" onPointerDown={(event) => event.stopPropagation()}>
            {isAdjusting ? (
              <>
                <button type="button" className="ticket-card__adjust-action ticket-card__adjust-done" onClick={finishAdjusting}>DONE</button>
                <button type="button" className="ticket-card__adjust-action ticket-card__adjust-cancel" onClick={cancelAdjusting}>CANCEL</button>
              </>
            ) : (
              <>
                {ticket.coverPhoto && <button type="button" className="ticket-card__adjust-action" onClick={startAdjusting}>ADJUST</button>}
                <label className={`ticket-card__upload${uploading ? ' is-uploading' : ''}`} onClick={(event) => event.stopPropagation()}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file) return;
                      void uploadCover(file);
                    }}
                  />
                  <span>{uploading ? 'PREPARING...' : ticket.hasCustomCover ? 'REPLACE PHOTO' : 'UPLOAD PHOTO'}</span>
                </label>
                {ticket.hasCustomCover && (
                  <button
                    type="button"
                    className="ticket-card__remove"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(ticket);
                    }}
                  >
                    REMOVE
                  </button>
                )}
              </>
            )}
          </span>
        )}
        {isCurrent && uploadFeedback && (
          <span className={'ticket-card__upload-error' + (uploadFeedback.status === 'success' ? ' is-success' : '')} role={uploadFeedback.status === 'error' ? 'alert' : 'status'}>
            {uploadFeedback.status === 'success' ? '已保存 1 张 · 失败 0 张' : `已保存 0 张 · 失败 1 张 · ${uploadFeedback.stage === 'saving' ? '保存未完成' : '图片处理失败'}`}
            {uploadFeedback.status === 'error' && (
              <button type="button" disabled={uploading} onClick={(event) => { event.stopPropagation(); void uploadCover(uploadFeedback.file, uploadFeedback.stage === 'saving'); }}>
                {uploadFeedback.stage === 'saving' ? '重试保存' : '重新上传'}
              </button>
            )}
          </span>
        )}
      </span>
      <span className="ticket-card__tear" aria-hidden="true" />
      <span className="ticket-card__stub">
        <span className="ticket-card__stub-kicker">TRAVEL MEMORY</span>
        <strong className={englishName.length > 7 ? 'is-long' : ''}>
          <span className="ticket-card__city-name-single">{englishName}</span>
          <span className="ticket-card__city-name-lines" aria-hidden="true">
            {cityDisplayLines.map((line) => <span key={line}>{line}</span>)}
          </span>
        </strong>
        <span className="ticket-card__city">{ticket.location.name}</span>
        <span className="ticket-card__date">
          <span className="ticket-card__date-start">{dateParts.start}</span>
          {dateParts.end && <span className="ticket-card__date-end"><span aria-hidden="true">—</span> {dateParts.end}</span>}
        </span>
        <span className="ticket-card__meta">{days ? `${days} DAYS` : 'DATE TO BE SET'} · {ticket.photos.length} PHOTOS</span>
        <span className="ticket-card__barcode" aria-hidden="true" />
        <span className="ticket-card__number">TRIP {String(ticket.sequence).padStart(3, '0')}</span>
      </span>
    </motion.div>
  );
}

function EmptyJourney({ onBack, onStartRecord }) {
  return (
    <section className="ticket-journey-empty" aria-live="polite">
      <span className="ticket-journey-empty__eyebrow">TIME JOURNEY / ARCHIVE</span>
      <h1>还没有可展示的旅程</h1>
      <p>记录一段旅行后，它会按日期出现在这里。</p>
      <div className="ticket-journey-empty__actions">
        <button type="button" onClick={onStartRecord}>记录一次旅行</button>
        <button type="button" onClick={onBack}>返回地球</button>
      </div>
    </section>
  );
}

export default function TimeJourney({ onBack, onStartRecord, onOpenTrip, browseState = null, onBrowseStateChange }) {
  const { locations, updateLocation, flushStorage, saveState, storageStatus } = useTravel();
  const reducedMotion = useReducedMotion();
  const savePresentation = getSaveStatusPresentation(saveState, storageStatus);
  const tickets = useMemo(() => sortJourneyTrips(locations), [locations]);
  const years = useMemo(() => getYearMarks(tickets), [tickets]);
  const restoredTicketIndex = browseState?.tripId
    ? tickets.findIndex((ticket) => ticket.trip.id === browseState.tripId && ticket.location.id === browseState.locationId)
    : -1;
  const [currentIndex, setCurrentIndex] = useState(() => Math.max(0, restoredTicketIndex));
  const [direction, setDirection] = useState(-1);
  const lockRef = useRef(false);
  const unlockTimerRef = useRef(null);
  const wheelAccumulatorRef = useRef(0);
  const touchStartRef = useRef(null);
  const pageRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sources = Object.values(CITY_SKETCH_CONFIG).map(({ src }) => src);
    sources.forEach((src) => {
      const image = new window.Image();
      image.decoding = 'async';
      image.src = src;
    });
  }, []);

  useEffect(() => {
    if (!tickets.length) {
      setCurrentIndex(0);
      return;
    }
    const savedIndex = browseState?.tripId
      ? tickets.findIndex((ticket) => ticket.trip.id === browseState.tripId && ticket.location.id === browseState.locationId)
      : -1;
    if (savedIndex >= 0) {
      setCurrentIndex(savedIndex);
      return;
    }
    setCurrentIndex((value) => Math.min(value, tickets.length - 1));
  }, [browseState?.locationId, browseState?.tripId, tickets]);

  useEffect(() => () => {
    if (unlockTimerRef.current) window.clearTimeout(unlockTimerRef.current);
  }, []);

  const goToTicket = useCallback((nextIndex) => {
    if (lockRef.current || !tickets.length) return false;
    const clampedIndex = Math.max(0, Math.min(tickets.length - 1, nextIndex));
    if (clampedIndex === currentIndex) return false;
    lockRef.current = true;
    setDirection(clampedIndex > currentIndex ? 1 : -1);
    setCurrentIndex(clampedIndex);
    unlockTimerRef.current = window.setTimeout(() => {
      lockRef.current = false;
    }, reducedMotion ? 90 : 430);
    return true;
  }, [currentIndex, reducedMotion, tickets.length]);

  const moveTicket = useCallback((step) => goToTicket(currentIndex + step), [currentIndex, goToTicket]);

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    if (lockRef.current) return;
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    wheelAccumulatorRef.current += delta;
    if (Math.abs(wheelAccumulatorRef.current) < 72) return;
    const step = wheelAccumulatorRef.current > 0 ? 1 : -1;
    wheelAccumulatorRef.current = 0;
    moveTicket(step);
  }, [moveTicket]);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return undefined;
    page.addEventListener('wheel', handleWheel, { passive: false });
    return () => page.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onBack();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        moveTicket(1);
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        moveTicket(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moveTicket, onBack]);

  const currentTicket = tickets[currentIndex] || null;
  useEffect(() => {
    if (!currentTicket || !onBrowseStateChange) return;
    onBrowseStateChange({
      locationId: currentTicket.location.id,
      tripId: currentTicket.trip.id,
      railOffset: browseState?.railOffset || 0,
    });
  }, [browseState?.railOffset, currentTicket, onBrowseStateChange]);
  const handleRailPositionChange = useCallback((railOffset) => {
    if (!currentTicket || !onBrowseStateChange) return;
    onBrowseStateChange({
      locationId: currentTicket.location.id,
      tripId: currentTicket.trip.id,
      railOffset,
    });
  }, [currentTicket, onBrowseStateChange]);
  const stackTickets = tickets.slice(currentIndex, currentIndex + 3);
  const currentTicketId = currentTicket?.id || null;
  const currentCityId = currentTicket?.cityId || '';
  const currentCityName = currentTicket?.location?.name || '';
  const currentSketchTicket = useMemo(() => (currentTicketId ? {
    id: currentTicketId,
    cityId: currentCityId,
    location: { name: currentCityName },
  } : null), [currentCityId, currentCityName, currentTicketId]);
  const currentSketchConfig = useMemo(
    () => getCitySketchConfig(currentSketchTicket),
    [currentSketchTicket],
  );
  const candidateSketches = useMemo(() => {
    const attractionSketches = getCityAttractionSketches(currentCityName);
    if (attractionSketches.length) return attractionSketches;
    return currentSketchConfig?.src ? [{ id: 'default', src: currentSketchConfig.src }] : [];
  }, [currentCityName, currentSketchConfig]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    candidateSketches.forEach(({ src }) => {
      const image = new window.Image();
      image.decoding = 'async';
      image.src = src;
    });
  }, [candidateSketches]);
  const sketchHistoryRef = useRef(new Map());
  const [selectedSketch, setSelectedSketch] = useState(null);

  useEffect(() => {
    if (!currentTicketId || !candidateSketches.length) {
      setSelectedSketch(null);
      return;
    }
    const cityKey = currentCityName || currentCityId || currentTicketId;
    const previous = sketchHistoryRef.current.get(cityKey) || [];
    const available = candidateSketches.filter((candidate) => !previous.includes(candidate.id));
    const pool = available.length ? available : candidateSketches;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    sketchHistoryRef.current.set(cityKey, [...previous, chosen.id].slice(-candidateSketches.length));
    setSelectedSketch({ ...chosen, ticketId: currentTicketId });
  }, [currentCityId, currentCityName, currentTicketId, candidateSketches]);

  const currentSketch = useMemo(() => {
    if (!currentSketchConfig) return null;
    return {
      ...currentSketchConfig,
      src: selectedSketch?.ticketId === currentTicketId
        ? selectedSketch.src
        : currentSketchConfig.src,
    };
  }, [currentSketchConfig, currentTicketId, selectedSketch]);
  const timelinePosition = currentTicket ? getTimelinePosition(currentTicket, tickets) : 0;
  const currentYear = currentTicket?.timestamp === null || !currentTicket ? '—' : new Date(currentTicket.timestamp).getFullYear();

  const handleTicketUpload = useCallback(async (ticket, coverPhoto, ticketPhotoPosition) => {
    return updateLocation(ticket.location.id, {
      trips: (ticket.location.trips || []).map((trip) => (
        trip.id === ticket.trip.id ? { ...trip, coverPhoto, ticketPhotoPosition } : trip
      )),
    });
  }, [updateLocation]);

  const handleTicketPositionSave = useCallback((ticket, ticketPhotoPosition) => {
    updateLocation(ticket.location.id, {
      trips: (ticket.location.trips || []).map((trip) => (
        trip.id === ticket.trip.id ? { ...trip, ticketPhotoPosition } : trip
      )),
    });
  }, [updateLocation]);

  const handleTicketRemove = useCallback((ticket) => {
    updateLocation(ticket.location.id, {
      trips: (ticket.location.trips || []).map((trip) => (
        trip.id === ticket.trip.id
          ? { ...trip, coverPhoto: null, ticketPhotoPosition: { x: 50, y: 50 } }
          : trip
      )),
    });
  }, [updateLocation]);

  const handleTouchStart = (event) => {
    const touch = event.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const handleTouchEnd = (event) => {
    if (touchStartRef.current === null) return;
    const touch = event.changedTouches[0];
    const distance = touch ? touchStartRef.current.y - touch.clientY : 0;
    const horizontalDistance = touch ? touchStartRef.current.x - touch.clientX : 0;
    touchStartRef.current = null;
    if (Math.abs(distance) > 36 && Math.abs(distance) > Math.abs(horizontalDistance) * 1.2) {
      moveTicket(distance > 0 ? 1 : -1);
    }
  };

  return (
    <main
      ref={pageRef}
      className="ticket-journey"
      tabIndex={0}
      aria-label="时间旅途票券档案"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="ticket-journey__paper" aria-hidden="true" />
      <AnimatePresence mode="sync" initial={false}>
        {currentTicket && currentSketch && (
          <motion.div
            key={`ambient-${currentTicket.id}`}
            className="ticket-journey-ambient"
            style={{ '--ticket-ambient-tint': currentSketch.ambientTint }}
            aria-hidden="true"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 0.12 }}
            exit={reducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reducedMotion ? 0.05 : 0.75, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait" initial={false}>
        {currentTicket && (
          <motion.aside
            key={currentTicket.id}
            className="ticket-journey-backdrop"
            style={{ '--ticket-decoration-color': currentTicket.trip.ticketStubColor || '#668b9b' }}
            aria-hidden="true"
            initial={reducedMotion ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, x: -8 }}
            transition={{ duration: reducedMotion ? 0.05 : 0.38, ease: 'easeOut' }}
          >
            {currentSketch && (
              <img
                className="ticket-city-sketch"
                src={currentSketch.src}
                alt=""
                aria-hidden="true"
                style={{
                  '--city-sketch-width': currentSketch.width,
                  '--city-sketch-max-width': currentSketch.maxWidth,
                  '--city-sketch-opacity': currentSketch.opacity,
                  '--city-sketch-left': currentSketch.left,
                  '--city-sketch-bottom': currentSketch.bottom,
                  '--city-sketch-x': currentSketch.translateX,
                  '--city-sketch-y': currentSketch.translateY,
                  '--city-sketch-origin': `${currentSketch.anchorX} ${currentSketch.anchorY}`,
                  '--city-sketch-rotation': `${currentSketch.rotation}deg`,
                  '--city-sketch-contrast': currentSketch.contrast || 1,
                }}
              />
            )}
            <span className="ticket-archive-fragment">
              <span className="ticket-archive-fragment__kicker">TRAVEL ARCHIVE</span>
              <strong>NO. {String(currentTicket.sequence).padStart(3, '0')}</strong>
              <span className="ticket-archive-fragment__date">{formatMonthYear(currentTicket.trip.startDate).replace('.', ' / ')}</span>
              <i className="ticket-archive-fragment__rule" />
              <i className="ticket-archive-fragment__barcode" />
              <small>TRIP {String(currentTicket.sequence).padStart(3, '0')}</small>
            </span>
          </motion.aside>
        )}
      </AnimatePresence>
      <header className="ticket-journey-header">
        <button className="ticket-journey-back" type="button" onClick={onBack} aria-label="返回地球" title="返回地球"><ActionIcon name="arrowLeft" size={18} /></button>
        <div className="ticket-journey-brand">
          <span>TRAVEL MEMORY</span>
          <strong>时间旅途</strong>
        </div>
        <div className="ticket-journey-counter" aria-live="polite">
          {tickets.length ? `${String(currentIndex + 1).padStart(2, '0')} / ${String(tickets.length).padStart(2, '0')}` : '00 / 00'}
        </div>
      </header>

      {savePresentation && (
        <div className={'ticket-journey-save-state is-' + saveState.status} role={saveState.status === 'error' ? 'alert' : 'status'}>
          <span>{savePresentation.label}</span>
          {savePresentation.retryLabel && <button type="button" onClick={() => { void flushStorage(); }}>{savePresentation.retryLabel}</button>}
        </div>
      )}

      <section className="ticket-time-ruler" aria-label="按年份排列的旅程时间线">
        <div className="ticket-time-ruler__line">
          <span className="ticket-time-ruler__progress" style={{ width: `${timelinePosition}%` }} />
          <div className="ticket-time-ruler__nodes">
            {tickets.map((ticket, index) => (
              <button
                key={ticket.id}
                type="button"
                className={`ticket-time-ruler__node${index === currentIndex ? ' is-active' : ''}`}
                style={{ left: `${getTimelinePosition(ticket, tickets)}%` }}
                data-ticket-index={index}
                aria-label={`切换到${ticket.location.name} ${formatMonthYear(ticket.trip.startDate)}`}
                onClick={() => goToTicket(index)}
              >
                <span className="ticket-time-ruler__node-dot" aria-hidden="true" />
                <span className="ticket-time-ruler__node-tooltip" aria-hidden="true">
                  {getCityEnglishName(ticket.location.name)}<br />{formatMonthYear(ticket.trip.startDate)}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="ticket-time-ruler__plane-wrap" style={{ left: `${timelinePosition}%` }}><PaperPlane /></div>
        <div className="ticket-time-ruler__years">
          {years.map((year) => <span key={year}>{year}</span>)}
          {!years.length && <span>YOUR NEXT JOURNEY</span>}
        </div>
      </section>

      <div className="ticket-journey-heading">
        <span>ARCHIVE OF PLACES / {currentYear}</span>
        <h1>每一张票，都是一段旅程</h1>
        <p>沿着真实发生的时间，重新打开走过的地方。</p>
      </div>

      {currentTicket ? (
        <section className="ticket-stack-region" aria-label="旅行票券堆叠">
          <div className="ticket-journey-ticket-stage">
            <div className="ticket-stack">
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                {stackTickets.map((ticket, stackIndex) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    stackIndex={stackIndex}
                    direction={direction}
                    reducedMotion={reducedMotion}
                    onOpen={onOpenTrip}
                    onUpload={handleTicketUpload}
                    onRetrySave={flushStorage}
                    onRemove={handleTicketRemove}
                    onSavePosition={handleTicketPositionSave}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
          <MiniTicketRail
            tickets={tickets}
            currentIndex={currentIndex}
            onSelect={goToTicket}
            reducedMotion={reducedMotion}
            getLabel={(ticket) => getCityEnglishName(ticket.location.name)}
            getDateLabel={formatMonthYear}
            restoredOffset={browseState?.railOffset || 0}
            onPositionChange={handleRailPositionChange}
          />
          <div className="ticket-stack-caption">
            <span>{currentTicket.location.name} · {formatDateRange(currentTicket.trip)}</span>
            <span>滚轮 / ↑ ↓ 切换票券 · 点击打开旅行记录</span>
          </div>
          <footer className="ticket-journey-footer">
            <span>TRIP {String(currentTicket.sequence).padStart(3, '0')}</span>
            <span>{tickets.length ? `${tickets.length} 段旅行 · 按日期排序` : '尚未建立旅行档案'}</span>
            <span>{tickets.length ? 'SCROLL TO TRAVEL' : 'RETURN TO EARTH'}</span>
          </footer>
        </section>
      ) : <EmptyJourney onBack={onBack} onStartRecord={onStartRecord} />}

      <AnimatePresence mode="wait" initial={false}>
        {currentTicket && (
          <motion.div
            key={currentTicket.id}
            className="ticket-stamp"
            style={{ '--ticket-stamp-color': currentTicket.trip.ticketStubColor || '#234751' }}
            aria-hidden="true"
            initial={reducedMotion ? false : { opacity: 0, scale: 0.94, rotate: -7 }}
            animate={{ opacity: 0.36, scale: 1, rotate: -4 }}
            exit={reducedMotion ? undefined : { opacity: 0, scale: 0.97, rotate: 3 }}
            transition={{ duration: reducedMotion ? 0.05 : 0.28, ease: 'easeOut' }}
          >
            <span>TRAVEL MEMORY</span>
            <strong>{getCityEnglishName(currentTicket.location.name)}</strong>
            <small>{formatMonthYear(currentTicket.trip.startDate)}</small>
            <i>VISITED</i>
          </motion.div>
        )}
      </AnimatePresence>

    </main>
  );
}
