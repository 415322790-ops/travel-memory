import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTravel } from '../context/TravelContext';
import {
  detectImageOrientation,
  getFilmTargetOrientation,
  getFinalRotation,
  getRotatedDimensions,
  loadEditedImage,
  normalizeCrop,
  normalizeRotation,
  rotateCropClockwise,
} from '../utils/filmImageEdits';
import {
  formatCalendarDate,
  formatCalendarDateLabel,
  formatCalendarMonthDay,
  formatCalendarWeekday,
  parseCalendarDate,
} from '../utils/calendarDate';
import { CropDialog, FrameActionMenu } from './ItineraryPhotoTools';
import ActionIcon from './ActionIcon';
import ConfirmDialog from './ConfirmDialog';
import { usePhotoObjectUrl } from '../storage/usePhotoObjectUrl';
import { getPhotoObjectUrl, releaseRuntimeAssetReference, retainRuntimeAsset } from '../storage/travelDb';
import { getSaveStatusPresentation } from '../utils/saveStatusPresentation';

const filmImageCache = new Map();
const ROLLS_PER_PAGE = 3;
const MAX_FILM_IMAGE_CACHE_ENTRIES = 72;
const DEBUG_FILM_LOADING = import.meta.env.DEV && import.meta.env.VITE_DEBUG_FILM_LOADING === 'true';

const FORMAT_OPTIONS = {
  standard135: { label: '135 标准画幅', shortLabel: '135 标准', edge: '135 STANDARD', perRoll: 4, columns: 4, frameRatio: 1.5, orientation: 'landscape', className: 'format-standard135', fit: 'cover' },
  half135: { label: '135 半格', shortLabel: '135 半格', edge: 'HALF FRAME', perRoll: 12, columns: 6, frameRatio: 0.78, orientation: 'portrait', className: 'format-half135', fit: 'cover' },
  medium120: { label: '120 中画幅', shortLabel: '120 中画幅', edge: '120 MEDIUM', perRoll: 4, columns: 2, frameRatio: 1, orientation: 'square', className: 'format-medium120', fit: 'contain' },
  large: { label: '大画幅', shortLabel: '大画幅', edge: 'LARGE FORMAT', perRoll: 2, columns: 2, frameRatio: 1.35, orientation: 'landscape', className: 'format-large', fit: 'contain' },
  free: { label: '自由索引', shortLabel: '自由索引', edge: 'FREE INDEX', perRoll: 6, columns: 3, frameRatio: 1.5, orientation: 'landscape', className: 'format-free', fit: 'contain' },
};

const MOOD_OPTIONS = ['\u677e\u5f1b', '\u60ca\u559c', '\u5145\u5b9e', '\u75b2\u60eb', '\u81ea\u7531'];
const JOURNAL_COPY = {
  processTitle: '\u65c5\u9014\u8fc7\u7a0b',
  processNote: '\u8bb0\u5f55\u4eca\u5929\u53bb\u8fc7\u7684\u5730\u65b9\u3001\u7ecf\u5386\u7684\u4e8b\u60c5\u548c\u6cbf\u9014\u7684\u7247\u6bb5\u3002',
  processPlaceholder: '\u8bb0\u5f55\u8fd9\u4e00\u5929\u7684\u65c5\u9014\u2026',
  moodTitle: '\u4eca\u65e5\u5fc3\u60c5',
  moodNote: '\u9009\u62e9\u6700\u63a5\u8fd1\u6b64\u523b\u611f\u53d7\u7684\u5fc3\u60c5\uff0c\u4e5f\u53ef\u4ee5\u8865\u5145\u4e00\u53e5\u8bdd\u3002',
  moodPlaceholder: '\u5199\u4e0b\u6b64\u523b\u7684\u5fc3\u60c5\u2026',
  reflectionTitle: '\u4eca\u65e5\u6240\u611f',
  reflectionNote: '\u5199\u4e0b\u8fd9\u4e00\u5929\u5e26\u7ed9\u4f60\u7684\u60f3\u6cd5\u3001\u8bb0\u5fc6\uff0c\u6216\u60f3\u7559\u7ed9\u672a\u6765\u7684\u8bdd\u3002',
  reflectionPlaceholder: '\u5199\u4e0b\u4eca\u65e5\u6240\u611f\u2026',
  addReflection: '+ \u4eca\u65e5\u6240\u611f',
  emptyProcess: '\u8fd8\u6ca1\u6709\u8bb0\u4e0b\u4eca\u5929\u7684\u65c5\u9014\u3002',
  emptyMood: '\u8fd8\u6ca1\u6709\u9009\u62e9\u5fc3\u60c5\u3002',
  emptyReflection: '\u6682\u65e0\u4eca\u65e5\u6240\u611f\u3002',
  edit: '\u7f16\u8f91',
  done: '\u5b8c\u6210',
  save: '\u4fdd\u5b58\u8bb0\u5f55',
};

function formatDate(date) {
  const value = parseCalendarDate(date);
  if (!value) return '待定日期';
  return value.getFullYear() + ' / ' + String(value.getMonth() + 1).padStart(2, '0') + ' / ' + String(value.getDate()).padStart(2, '0');
}

function formatCompactDate(date) {
  return formatCalendarMonthDay(date) || '待定';
}

function formatWeekday(date) {
  return formatCalendarWeekday(date);
}

function cleanLabel(label) {
  return String(label || '').replace(/^[^一-龥A-Za-z0-9]+/, '').trim();
}

function formatPickerDate(date) {
  return formatCalendarDateLabel(date) || '选择日期';
}

function toDateValue(value) {
  return parseCalendarDate(value) || parseCalendarDate(new Date()) || new Date();
}

function toIsoDate(value) {
  return formatCalendarDate(value);
}

function startOfMonth(value) {
  return new Date(value.getFullYear(), value.getMonth(), 1, 12, 0, 0, 0);
}

function getCalendarDays(month) {
  const first = startOfMonth(month);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function DateRangePicker({ startDate, endDate, onChange }) {
  const [open, setOpen] = useState(false);
  const [activeField, setActiveField] = useState('start');
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(toDateValue(startDate || endDate || new Date())));
  const pickerRef = useRef(null);
  const firstDayRef = useRef(null);

  const calendarRef = useRef(null);
  const [calendarStyle, setCalendarStyle] = useState({});

  useLayoutEffect(() => {
    if (!open) return undefined;
    const updateCalendarPosition = () => {
      const anchor = pickerRef.current?.getBoundingClientRect();
      const calendar = calendarRef.current;
      if (!anchor) return;
      const width = Math.min(320, window.innerWidth - 32);
      const height = calendar?.offsetHeight || 430;
      const left = Math.min(Math.max(12, anchor.left), Math.max(12, window.innerWidth - width - 12));
      let top = anchor.bottom + 10;
      if (top + height > window.innerHeight - 12) top = anchor.top - height - 10;
      top = Math.max(12, Math.min(top, Math.max(12, window.innerHeight - height - 12)));
      setCalendarStyle({
        position: 'fixed',
        zIndex: 130,
        top: top + 'px',
        left: left + 'px',
        width: width + 'px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 24px)',
        overflow: 'auto',
        boxSizing: 'border-box',
        transform: 'none',
      });
    };
    const onPointerDown = (event) => {
      if (!pickerRef.current?.contains(event.target) && !calendarRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [
        ...(pickerRef.current ? Array.from(pickerRef.current.querySelectorAll('button, select')) : []),
        ...(calendarRef.current ? Array.from(calendarRef.current.querySelectorAll('button, select')) : []),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    updateCalendarPosition();
    const frame = requestAnimationFrame(() => {
      updateCalendarPosition();
      firstDayRef.current?.focus();
    });
    window.addEventListener('resize', updateCalendarPosition);
    window.addEventListener('scroll', updateCalendarPosition, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateCalendarPosition);
      window.removeEventListener('scroll', updateCalendarPosition, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, visibleMonth, draftStart, draftEnd]);
  const openPicker = (field) => {
    const nextDate = field === 'start' ? startDate : endDate;
    setDraftStart(startDate);
    setDraftEnd(endDate);
    setActiveField(field);
    setVisibleMonth(startOfMonth(toDateValue(nextDate || startDate || endDate || new Date())));
    setOpen(true);
  };

  const chooseDate = (date) => {
    const nextDate = toIsoDate(date);
    let nextStart = draftStart;
    let nextEnd = draftEnd;

    if (activeField === 'start') {
      nextStart = nextDate;
      if (nextEnd && nextDate > nextEnd) nextEnd = '';
      setActiveField('end');
    } else if (!nextStart || nextDate < nextStart) {
      nextStart = nextDate;
      nextEnd = '';
    } else {
      nextEnd = nextDate;
    }

    setDraftStart(nextStart);
    setDraftEnd(nextEnd);

    // Commit a complete range immediately so the outer form can be submitted.
    if (nextStart && nextEnd && nextEnd >= nextStart) onChange(nextStart, nextEnd);
  };

  const confirm = () => {
    if (!draftStart || !draftEnd || draftEnd < draftStart) return;
    onChange(draftStart, draftEnd);
    setOpen(false);
  };

  const moveMonth = (delta) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const years = Array.from({ length: 21 }, (_, index) => new Date().getFullYear() - 10 + index);
  const calendarDays = getCalendarDays(visibleMonth);

  return (
    <div className="itinerary-film-date-picker" ref={pickerRef}>
      <div className="itinerary-film-date-fields">
        <button type="button" className={activeField === 'start' && open ? 'is-active' : ''} onClick={() => openPicker('start')} aria-haspopup="dialog" aria-expanded={open}>
          <span>出发日期</span><strong>{formatPickerDate(startDate)}</strong>
        </button>
        <span className="itinerary-film-date-arrow">→</span>
        <button type="button" className={activeField === 'end' && open ? 'is-active' : ''} onClick={() => openPicker('end')} aria-haspopup="dialog" aria-expanded={open}>
          <span>返回日期</span><strong>{formatPickerDate(endDate)}</strong>
        </button>
      </div>
      {open && createPortal((
        <div ref={calendarRef} className="itinerary-film-calendar is-portaled" style={calendarStyle} role="dialog" aria-modal="true" aria-label="选择旅行日期">
          <div className="itinerary-film-calendar-head">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="上个月">←</button>
            <div>
              <select value={visibleMonth.getFullYear()} onChange={(event) => setVisibleMonth(new Date(Number(event.target.value), visibleMonth.getMonth(), 1))} aria-label="选择年份">
                {years.map((year) => <option key={year} value={year}>{year}年</option>)}
              </select>
              <select value={visibleMonth.getMonth()} onChange={(event) => setVisibleMonth(new Date(visibleMonth.getFullYear(), Number(event.target.value), 1))} aria-label="选择月份">
                {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{index + 1}月</option>)}
              </select>
            </div>
            <button type="button" onClick={() => moveMonth(1)} aria-label="下个月">→</button>
          </div>
          <div className="itinerary-film-calendar-weekdays">{['日', '一', '二', '三', '四', '五', '六'].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="itinerary-film-calendar-grid">
            {calendarDays.map((day, index) => {
              const value = toIsoDate(day);
              const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
              const isStart = value === draftStart;
              const isEnd = value === draftEnd;
              const inRange = draftStart && draftEnd && value > draftStart && value < draftEnd;
              return <button ref={index === 0 ? firstDayRef : undefined} type="button" key={value} className={(isCurrentMonth ? '' : 'is-outside ') + (isStart ? 'is-start ' : '') + (isEnd ? 'is-end ' : '') + (inRange ? 'is-in-range' : '')} onClick={() => chooseDate(day)}>{day.getDate()}</button>;
            })}
          </div>
          <div className="itinerary-film-calendar-actions">
            <button type="button" onClick={() => { const today = new Date(); setVisibleMonth(startOfMonth(today)); chooseDate(today); }}>今天</button>
            <span>{draftStart && draftEnd ? formatPickerDate(draftStart) + ' → ' + formatPickerDate(draftEnd) : activeField === 'start' ? '先选择出发日期' : '再选择返回日期'}</span>
            <button type="button" onClick={() => { setDraftStart(startDate); setDraftEnd(endDate); setOpen(false); }}>取消</button>
            <button type="button" className="is-primary" onClick={confirm} disabled={!draftStart || !draftEnd || draftEnd < draftStart}>确认</button>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
function getBlock(day, type) {
  return (day?.blocks || []).find((block) => block.type === type) || null;
}

function getJourneyProcessText(itinerary) {
  const data = itinerary?.data || {};
  if (typeof data.journeyText === 'string' && data.journeyText.trim()) return data.journeyText;
  return (data.slots || []).map((slot) => String(slot?.text || '').trim()).filter(Boolean).join('\n\n');
}

function getJournalWeather(day, location) {
  return day?.weather || day?.weatherLabel || day?.meta?.weather || location?.weather || '';
}
function formatTripRange(startDate, endDate) {
  if (!startDate) return '未定日期';
  const start = startDate.replaceAll('-', '.');
  const end = endDate && endDate !== startDate ? endDate.replaceAll('-', '.') : '';
  return end ? start + '—' + end : start;
}

function getJourneyGroups(location) {
  return (location?.trips || [])
    .map((trip, tripIndex) => {
      const days = (trip.days || [])
        .map((day, dayIndex) => ({ day, trip, tripIndex, dayIndex }))
        .sort((a, b) => String(a.day.date || '').localeCompare(String(b.day.date || '')));
      return {
        trip,
        days,
        startDate: trip.startDate || days[0]?.day.date || '',
        endDate: trip.endDate || days[days.length - 1]?.day.date || '',
      };
    })
    .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
}
function getTripPhotos(trip) {
  const photos = (Array.isArray(trip?.photos) ? trip.photos : []).map((photo, index) => {
    const data = photo && typeof photo === 'object' ? photo : { url: photo };
    return {
    ...data,
    id: data.id || (trip.id + '-photo-' + index),
    url: data.url || data.src || '',
    width: Number(data.width) || undefined,
    height: Number(data.height) || undefined,
    aspectRatio: Number(data.aspectRatio) || undefined,
    orientation: data.orientation || '',
    fileName: data.fileName || data.name || '',
    fileType: data.fileType || data.type || '',
    fileSize: Number(data.fileSize || data.size) || 0,
    sourceWidth: Number(data.sourceWidth) || undefined,
    sourceHeight: Number(data.sourceHeight) || undefined,
    date: data.date || '',
    rotation: normalizeRotation(data.rotation),
    crop: normalizeCrop(data.crop),
    source: data.source || 'photo',
    sourceIndex: Number.isInteger(data.sourceIndex) ? data.sourceIndex : index,
    mealType: data.mealType,
    label: cleanLabel(data.label) || (data.source === 'meal' ? '当日餐食' : ''),
    };
  }).filter((photo) => photo.url || photo.id);
  return photos;
}

function getRolls(photos, format) {
  const rolls = [];
  for (let index = 0; index < photos.length; index += format.perRoll) {
    rolls.push(photos.slice(index, index + format.perRoll));
  }
  return rolls;
}


async function decodeUploadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // 不支持 EXIF 归一化时回退到浏览器图片解码。
    }
  }
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('照片读取失败，请换一张照片'));
    };
    image.src = objectUrl;
  });
}

async function compressImage(file, maxWidth = 1200, quality = 0.72) {
  const image = await decodeUploadImage(file);
  try {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scale = Math.min(1, maxWidth / sourceWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法处理这张照片');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error('当前浏览器无法生成照片预览'));
      }, 'image/jpeg', quality);
    });
    return {
      blob,
      width: canvas.width,
      height: canvas.height,
      aspectRatio: canvas.width / canvas.height,
      orientation: detectImageOrientation(canvas.width, canvas.height),
      fileName: file.name || '',
      fileType: file.type || '',
      fileSize: file.size || 0,
      sourceWidth,
      sourceHeight,
    };
  } finally {
    if (typeof image.close === 'function') image.close();
  }
}

function getCoverRect(image, x, y, width, height, fit) {
  const imageRatio = image.width / image.height;
  const boxRatio = width / height;
  if (fit === 'contain') {
    if (imageRatio > boxRatio) {
      const nextHeight = width / imageRatio;
      return { x, y: y + (height - nextHeight) / 2, width, height: nextHeight };
    }
    const nextWidth = height * imageRatio;
    return { x: x + (width - nextWidth) / 2, y, width: nextWidth, height };
  }
  if (imageRatio > boxRatio) {
    const cropWidth = image.height * boxRatio;
    return { sx: (image.width - cropWidth) / 2, sy: 0, sw: cropWidth, sh: image.height, x, y, width, height };
  }
  const cropHeight = image.width / boxRatio;
  return { sx: 0, sy: (image.height - cropHeight) / 2, sw: image.width, sh: cropHeight, x, y, width, height };
}

async function createFilmExport(photos, format, settings, rollNumber, metadata = {}) {
  const scale = settings.size === '2k' ? 1.5 : settings.size === '4k' ? 2.2 : 1;
  const width = Math.round(1180 * scale);
  const gap = Math.round(22 * scale);
  const edge = Math.round(76 * scale);
  const columns = format.columns;
  const frameWidth = Math.floor((width - edge * 2 - gap * (columns - 1)) / columns);
  const frameHeight = Math.round(frameWidth / format.frameRatio);
  const rows = Math.max(1, Math.ceil(photos.length / columns));
  const height = edge * 2 + rows * frameHeight + (rows - 1) * gap + Math.round(34 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#11100e';
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#e4c875';
  context.font = Math.round(12 * scale) + 'px sans-serif';
  context.textAlign = 'left';
  if (settings.includeMeta) {
    const edgeParts = [];
    if (settings.includeLocation && metadata.location) edgeParts.push(metadata.location);
    if (settings.includeDate && metadata.date) edgeParts.push(metadata.date);
    edgeParts.push(format.edge);
    if (settings.includeRoll) edgeParts.push('ROLL ' + String(rollNumber + 1).padStart(2, '0'));
    context.fillText(edgeParts.join('  /  '), Math.round(20 * scale), Math.round(24 * scale));
  }

  const sprocketSize = Math.round(12 * scale);
  const sprocketGap = Math.round(10 * scale);
  for (let x = 20; x < width - 20; x += sprocketSize + sprocketGap) {
    context.fillStyle = '#050505';
    context.fillRect(x, Math.round(34 * scale), sprocketSize, Math.round(17 * scale));
    context.fillRect(x, height - Math.round(28 * scale), sprocketSize, Math.round(17 * scale));
  }

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const image = await loadEditedImage(photo, { targetOrientation: format.orientation });
    try {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = edge + column * (frameWidth + gap);
      const y = edge + row * (frameHeight + gap);
      context.fillStyle = '#050505';
      context.fillRect(x - 5, y - 5, frameWidth + 10, frameHeight + 10);
      const rect = getCoverRect(image, x, y, frameWidth, frameHeight, format.fit);
      context.save();
      context.beginPath();
      context.rect(x, y, frameWidth, frameHeight);
      context.clip();
      if (rect.sx !== undefined) {
        context.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, rect.x, rect.y, rect.width, rect.height);
      } else {
        context.fillStyle = '#1d1b18';
        context.fillRect(x, y, frameWidth, frameHeight);
        context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      }
      context.restore();
      if (settings.includeFrame) {
        context.fillStyle = '#b8a36b';
        context.font = Math.round(10 * scale) + 'px sans-serif';
        context.fillText('FRAME ' + String(index + 1).padStart(2, '0') + 'A', x, y + frameHeight + Math.round(16 * scale));
      }
    } finally {
      if (typeof image.close === 'function') image.close();
    }
  }

  const mime = settings.format === 'jpg' ? 'image/jpeg' : 'image/png';
  return {
    url: canvas.toDataURL(mime, settings.quality === 'standard' ? 0.82 : settings.quality === 'high' ? 0.94 : 1),
    extension: settings.format,
  };
}

function downloadDataUrl(url, filename) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function preloadFilmImage(url, assetId = '') {
  if (!url) return Promise.resolve(null);
  const cachedEntry = filmImageCache.get(url);
  if (cachedEntry) {
    filmImageCache.delete(url);
    filmImageCache.set(url, cachedEntry);
    return cachedEntry.promise;
  }

  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  const image = new Image();
  const retainedAssetId = assetId && retainRuntimeAsset(assetId) ? assetId : '';
  const entry = { image, promise, resolve: resolvePromise, retainedAssetId };
  image.onload = () => resolvePromise(image);
  image.onerror = () => {
    resolvePromise(null);
    if (filmImageCache.get(url) === entry) filmImageCache.delete(url);
    if (entry.retainedAssetId) releaseRuntimeAssetReference(entry.retainedAssetId);
  };
  filmImageCache.set(url, entry);
  image.src = url;

  while (filmImageCache.size > MAX_FILM_IMAGE_CACHE_ENTRIES) {
    const oldest = filmImageCache.entries().next().value;
    if (!oldest) break;
    const [oldestUrl, oldestEntry] = oldest;
    filmImageCache.delete(oldestUrl);
    if (!oldestEntry.image.complete) {
      oldestEntry.image.onload = null;
      oldestEntry.image.onerror = null;
      oldestEntry.image.src = '';
      oldestEntry.resolve(null);
    }
    if (oldestEntry.retainedAssetId) releaseRuntimeAssetReference(oldestEntry.retainedAssetId);
  }
  return promise;
}

function getFilmLoadSourceType(url) {
  if (typeof url !== 'string') return 'unknown';
  if (url.startsWith('blob:')) return 'blob';
  if (url.startsWith('data:')) return 'data';
  if (/^https?:\/\//i.test(url)) return 'http';
  return 'unknown';
}

function getFilmLoadPhotoName(photo) {
  return photo?.fileName || photo?.name || photo?.originalName || photo?.label || photo?.id || 'unknown';
}

function isFilmImageInViewport(image) {
  if (!image || !image.getClientRects().length) return { visible: false, intersectionRatio: 0 };
  const rect = image.getBoundingClientRect();
  const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  const area = Math.max(0, rect.width * rect.height);
  const intersectionRatio = area ? Number(((visibleWidth * visibleHeight) / area).toFixed(3)) : 0;
  return { visible: intersectionRatio > 0, intersectionRatio };
}

function logFilmLoad(photo, image, details = {}) {
  if (!DEBUG_FILM_LOADING) return;
  const decodedWidth = Number(image?.naturalWidth || photo?.width || 0);
  const decodedHeight = Number(image?.naturalHeight || photo?.height || 0);
  const sourceWidth = Number(photo?.sourceWidth || decodedWidth);
  const sourceHeight = Number(photo?.sourceHeight || decodedHeight);
  const sourceMegapixels = sourceWidth > 0 && sourceHeight > 0 ? Number((sourceWidth * sourceHeight / 1000000).toFixed(2)) : 0;
  const decodedMegapixels = decodedWidth > 0 && decodedHeight > 0 ? Number((decodedWidth * decodedHeight / 1000000).toFixed(2)) : 0;
  const fileSize = Number(photo?.fileSize || photo?.size || 0);
  const visibility = isFilmImageInViewport(image);
  console.info('[FilmLoad] ' + JSON.stringify({
    photoId: photo?.id,
    fileName: getFilmLoadPhotoName(photo),
    fileType: photo?.fileType || photo?.type || 'unknown',
    fileSize: fileSize ? Math.round(fileSize / 1024) + ' KB' : 'unknown',
    sourceWidth,
    sourceHeight,
    sourceMegapixels,
    decodedWidth,
    decodedHeight,
    decodedMegapixels,
    orientation: photo?.orientation || detectImageOrientation(decodedWidth, decodedHeight),
    urlType: getFilmLoadSourceType(photo?.url),
    loading: image?.loading || 'unknown',
    visible: visibility.visible,
    intersectionRatio: visibility.intersectionRatio,
    error: null,
    ...details,
  }));
}

function logFilmVisibility(photo, image, loadingState, loading) {
  if (!DEBUG_FILM_LOADING || !image) return;
  const style = window.getComputedStyle(image);
  console.info('[FilmVisibility] ' + JSON.stringify({
    photoId: photo?.id,
    loadingMode: loading,
    reactLoadState: loadingState,
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    computedOpacity: style.opacity,
    computedVisibility: style.visibility,
    computedDisplay: style.display,
    placeholderVisible: loadingState !== 'loaded',
  }));
}

function getPreviewGeometry(sourceRatio, frameRatio, rotation, fit) {
  const imageRatio = Number(sourceRatio) > 0 ? Number(sourceRatio) : 1;
  const targetRatio = Number(frameRatio) > 0 ? Number(frameRatio) : 1;
  const displayedRatio = rotation % 180 ? 1 / imageRatio : imageRatio;
  const covers = fit !== 'contain';
  let visualWidth;
  let visualHeight;
  if (covers) {
    if (displayedRatio >= targetRatio) {
      visualWidth = displayedRatio / targetRatio;
      visualHeight = 1;
    } else {
      visualWidth = 1;
      visualHeight = targetRatio / displayedRatio;
    }
  } else {
    if (displayedRatio >= targetRatio) {
      visualWidth = 1;
      visualHeight = targetRatio / displayedRatio;
    } else {
      visualWidth = displayedRatio / targetRatio;
      visualHeight = 1;
    }
  }
  const quarterTurn = rotation % 180 !== 0;
  const rawWidth = quarterTurn ? visualHeight / targetRatio : visualWidth;
  const rawHeight = quarterTurn ? visualWidth * targetRatio : visualHeight;
  return {
    width: rawWidth * 100,
    height: rawHeight * 100,
    visualWidth,
    visualHeight,
    sourceRatio: imageRatio,
  };
}

function getSourceCrop(crop, rotation) {
  let sourceCrop = normalizeCrop(crop);
  if (!sourceCrop) return null;
  const turns = normalizeRotation(rotation) / 90;
  const reverseTurns = (4 - turns) % 4;
  for (let index = 0; index < reverseTurns; index += 1) {
    sourceCrop = rotateCropClockwise(sourceCrop);
  }
  return sourceCrop;
}

function ZoomableFilmImage({ photo, format, interactionMode, onLockChange, loading = 'lazy', frameIndex, page, roll }) {
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const lensRef = useRef(null);
  const rafRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);
  const [loadState, setLoadState] = useState('loading');
  const [showLens, setShowLens] = useState(false);
  const [locked, setLocked] = useState(false);
  const [zoom, setZoom] = useState(2.4);
  const [sourceRatio, setSourceRatio] = useState(() => Number(photo?.aspectRatio) || (Number(photo?.width) / Number(photo?.height)) || 1);
  const [initialRenderTime] = useState(() => performance.now());
  const previewStartRef = useRef(initialRenderTime);
  const mountTimeRef = useRef(initialRenderTime);
  const requestStartRef = useRef(initialRenderTime);
  const loadingRef = useRef(loading);
  const loadStateRef = useRef('loading');
  const loadedUrlRef = useRef('');
  const loadedLogKeyRef = useRef('');
  const sourceInitializedRef = useRef(false);
  const renderUrl = usePhotoObjectUrl(photo);
  const photoId = photo?.id || '';
  const photoFileName = getFilmLoadPhotoName(photo);
  const isMagnifierMode = interactionMode === 'magnifier';
  const targetOrientation = getFilmTargetOrientation(format);
  const finalRotation = getFinalRotation(photo, targetOrientation);
  const crop = getSourceCrop(photo?.crop, finalRotation);
  const croppedRatio = crop ? sourceRatio * (crop.width / crop.height) : sourceRatio;
  const geometry = getPreviewGeometry(croppedRatio, format.frameRatio, finalRotation, format.fit);
  const previewStyle = {
    width: geometry.width + '%',
    height: geometry.height + '%',
    overflow: crop ? 'hidden' : 'visible',
    '--film-image-position': crop ? 'absolute' : 'relative',
    '--film-image-left': crop ? -(crop.x / crop.width) * 100 + '%' : 'auto',
    '--film-image-top': crop ? -(crop.y / crop.height) * 100 + '%' : 'auto',
    '--film-image-width': crop ? (1 / crop.width) * 100 + '%' : '100%',
    '--film-image-height': crop ? (1 / crop.height) * 100 + '%' : '100%',
    transform: 'translate(-50%, -50%) rotate(' + finalRotation + 'deg)',
  };
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const handleImageLoad = useCallback((event) => {
    const image = event.currentTarget;
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const nextRatio = width > 0 && height > 0 ? width / height : 1;
    setSourceRatio(nextRatio);
    loadedUrlRef.current = renderUrl;
    loadStateRef.current = 'loaded';
    setLoadState((current) => current === 'loaded' ? current : 'loaded');
    const loadLogKey = renderUrl + '|' + width + 'x' + height;
    const shouldRecordLoad = loadedLogKeyRef.current !== loadLogKey;
    if (!shouldRecordLoad) return;
    loadedLogKeyRef.current = loadLogKey;
    const loadTime = performance.now();
    const resource = typeof performance.getEntriesByName === 'function'
      ? performance.getEntriesByName(renderUrl).at(-1)
      : null;
    const decodeStart = performance.now();
    const decodePromise = typeof image.decode === 'function' ? image.decode() : Promise.resolve();
    decodePromise.catch(() => undefined).then(() => {
      const decodeDuration = Math.round(performance.now() - decodeStart);
      if (DEBUG_FILM_LOADING) {
        logFilmLoad(photo, image, {
          event: 'loaded',
          mountMs: Math.round(loadTime - mountTimeRef.current),
          requestMs: resource?.duration ? Math.round(resource.duration) : 'unknown',
          requestStart: resource?.startTime ? Math.round(resource.startTime) + 'ms' : 'unknown',
          onLoadMs: Math.round(loadTime - requestStartRef.current),
          decodeMs: decodeDuration,
          totalReadyMs: Math.round(performance.now() - mountTimeRef.current),
          status: decodeDuration > 300 ? 'slow' : 'loaded',
          retry: 0,
        });
      }
    });
    if (DEBUG_FILM_LOADING) {
      const rotated = getRotatedDimensions(width, height, finalRotation);
      const visibility = isFilmImageInViewport(image);
      console.info('[FilmPreview] ' + JSON.stringify({
        photoId: photo.id,
        frameIndex,
        page,
        roll,
        orientation: photo.orientation || detectImageOrientation(width, height),
        autoRotation: getFinalRotation({ ...photo, rotation: 0 }, targetOrientation),
        visible: visibility.visible,
        intersectionRatio: visibility.intersectionRatio,
        loadingState: 'loaded',
        loading: image.loading,
        finalRotation,
        visualWidth: rotated.width,
        visualHeight: rotated.height,
        previewReadyMs: Math.round(performance.now() - previewStartRef.current),
      }));
      requestAnimationFrame(() => logFilmVisibility(photo, image, 'loaded', image.loading || loading));
    }
  }, [finalRotation, frameIndex, loading, page, photo, renderUrl, roll, targetOrientation]);

  const handleImageError = () => {
    loadStateRef.current = 'error';
    setLoadState('error');
    if (DEBUG_FILM_LOADING) {
      const visibility = isFilmImageInViewport(imageRef.current);
      console.warn('[FilmLoad] ' + JSON.stringify({
        photoId: photo?.id,
        fileName: getFilmLoadPhotoName(photo),
        event: 'error',
        retry: 0,
        urlType: getFilmLoadSourceType(renderUrl),
        loading: imageRef.current?.loading || loading,
        visible: visibility.visible,
        intersectionRatio: visibility.intersectionRatio,
        error: 'image-load-failed',
      }));
    }
  };

  useLayoutEffect(() => {
    let mountFrame = 0;
    const sourceChanged = loadedUrlRef.current !== renderUrl;
    if (sourceChanged) {
      loadedUrlRef.current = '';
      loadedLogKeyRef.current = '';
      loadStateRef.current = 'loading';
      setLoadState((current) => current === 'loading' ? current : 'loading');
      setShowLens(false);
      setLocked(false);
      setSourceRatio(Number(photo?.aspectRatio) || (Number(photo?.width) / Number(photo?.height)) || 1);
      const startedAt = sourceInitializedRef.current ? performance.now() : initialRenderTime;
      sourceInitializedRef.current = true;
      mountTimeRef.current = startedAt;
      requestStartRef.current = startedAt;
      previewStartRef.current = startedAt;
      loadingRef.current = loading;
      if (DEBUG_FILM_LOADING) {
        mountFrame = requestAnimationFrame(() => {
          const visibility = isFilmImageInViewport(imageRef.current);
          console.info('[FilmLoad] ' + JSON.stringify({
            photoId,
            fileName: photoFileName,
            event: 'mount',
            mountTime: new Date().toISOString(),
            urlType: getFilmLoadSourceType(renderUrl),
            loading: loadingRef.current,
            visible: visibility.visible,
            intersectionRatio: visibility.intersectionRatio,
            error: null,
          }));
        });
      }
    }

    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0 && loadStateRef.current !== 'loaded') {
      handleImageLoad({ currentTarget: image, fromCache: true });
    }
    return () => {
      if (mountFrame) cancelAnimationFrame(mountFrame);
    };
  }, [handleImageLoad, initialRenderTime, loading, photo?.aspectRatio, photo?.height, photo?.width, photoFileName, photoId, renderUrl]);

  useEffect(() => {
    const resetZoom = () => {
      setLocked(false);
      setShowLens(false);
      setZoom(2.4);
    };
    window.addEventListener('itinerary:reset-film-zoom', resetZoom);
    return () => window.removeEventListener('itinerary:reset-film-zoom', resetZoom);
  }, []);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const updateLens = useCallback(() => {
    rafRef.current = 0;
    const stage = stageRef.current;
    const image = imageRef.current;
    const lens = lensRef.current;
    if (!isMagnifierMode || !stage || !image || !lens || !image.naturalWidth || !image.naturalHeight) return;
    const stageRect = stage.getBoundingClientRect();
    const scale = format.fit === 'contain'
      ? Math.min(stageRect.width / image.naturalWidth, stageRect.height / image.naturalHeight)
      : Math.max(stageRect.width / image.naturalWidth, stageRect.height / image.naturalHeight);
    const renderedWidth = image.naturalWidth * scale;
    const renderedHeight = image.naturalHeight * scale;
    const offsetX = (stageRect.width - renderedWidth) / 2;
    const offsetY = (stageRect.height - renderedHeight) / 2;
    const sourceX = Math.max(0, Math.min(1, (pointerRef.current.x - offsetX) / renderedWidth));
    const sourceY = Math.max(0, Math.min(1, (pointerRef.current.y - offsetY) / renderedHeight));
    const lensSize = Math.min(220, Math.max(180, Math.min(stageRect.width, stageRect.height) * 0.82));
    const left = Math.max(0, Math.min(stageRect.width - lensSize, pointerRef.current.x - lensSize / 2));
    const top = Math.max(0, Math.min(stageRect.height - lensSize, pointerRef.current.y - lensSize / 2));
    lens.style.setProperty('--lens-size', lensSize + 'px');
    lens.style.transform = 'translate3d(' + left + 'px, ' + top + 'px, 0)';
    lens.style.backgroundImage = 'url("' + renderUrl + '")';
    lens.style.backgroundSize = renderedWidth * zoom + 'px ' + renderedHeight * zoom + 'px';
    lens.style.backgroundPosition = (lensSize / 2 - (offsetX + sourceX * renderedWidth) * zoom) + 'px ' + (lensSize / 2 - (offsetY + sourceY * renderedHeight) * zoom) + 'px';
  }, [format.fit, isMagnifierMode, zoom, renderUrl]);

  const scheduleLens = (event) => {
    if (!isMagnifierMode && !locked) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    pointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(updateLens);
  };

  const warmHighRes = () => {
    if (!isMagnifierMode) return;
    preloadFilmImage(renderUrl, photo?.assetId || photo?.id || '').then((image) => {
      if (image && rafRef.current === 0) rafRef.current = requestAnimationFrame(updateLens);
    });
  };

  const handleEnter = (event) => {
    if (event.pointerType !== 'touch' && isMagnifierMode) setShowLens(true);
    warmHighRes();
  };

  const handleLeave = () => {
    if (!locked) setShowLens(false);
  };

  const handlePointerDown = (event) => {
    if (!isMagnifierMode || event.pointerType !== 'touch') return;
    const now = performance.now();
    if (now - lastTapRef.current < 320) {
      const nextLocked = !locked;
      setLocked(nextLocked);
      setShowLens(nextLocked);
      onLockChange(nextLocked);
    }
    lastTapRef.current = now;
  };

  const handleClick = (event) => {
    if (!isMagnifierMode || event.pointerType === 'touch') return;
    event.preventDefault();
    event.stopPropagation();
    const nextLocked = !locked;
    setLocked(nextLocked);
    setShowLens(true);
    onLockChange(nextLocked);
  };

  const handleDoubleClick = (event) => {
    if (!isMagnifierMode || event.pointerType === 'touch') return;
    event.preventDefault();
    event.stopPropagation();
    setLocked(true);
    setZoom((value) => value > 2.4 ? 2.4 : 3.1);
    setShowLens(true);
    onLockChange(true);
  };

  return (
    <div ref={stageRef} className={'itinerary-film-image-stage ' + (loadState === 'loaded' ? 'is-loaded ' : '') + (loadState === 'error' ? 'has-error ' : '') + (isMagnifierMode ? 'is-magnifier-mode ' : '') + (locked ? 'is-zoom-locked' : '')} onPointerEnter={handleEnter} onPointerMove={scheduleLens} onPointerLeave={handleLeave} onPointerDown={handlePointerDown} onClick={handleClick} onDoubleClick={handleDoubleClick}>
      {loadState === 'error' ? <span className="itinerary-film-image-error">IMAGE UNAVAILABLE</span> : renderUrl ? <div className="itinerary-film-image-visual" style={previewStyle}><img ref={imageRef} className="itinerary-film-image" src={renderUrl} alt={photo.label || '旅行照片'} loading={loading} decoding="async" style={{ objectFit: 'fill' }} onLoad={handleImageLoad} onError={handleImageError} /></div> : <span className="itinerary-film-image-loading">LOADING IMAGE...</span>}
      {isMagnifierMode && showLens && loadState !== 'error' && <div ref={lensRef} className="itinerary-film-zoom-lens" aria-hidden="true" />}
    </div>
  );
}

function EditedPhotoImage({ photo, format, alt }) {
  const finalRotation = getFinalRotation(photo, format.orientation);
  const url = usePhotoObjectUrl(photo);
  return url ? <img src={url} alt={alt} style={{ transform: 'rotate(' + finalRotation + 'deg)' }} /> : <span className="itinerary-film-image-loading">LOADING IMAGE...</span>;
}
function FilmFrame({ photo, index, page, roll, format, interactionMode, onOpen, onRemove, onMenu, onLockChange }) {
  const canEdit = Boolean(photo?.id || photo?.url);
  const openMenu = (event) => {
    event.preventDefault();
    if (canEdit) {
      const trigger = event.currentTarget.querySelector('.itinerary-film-frame-menu-button');
      onMenu(photo, { x: event.clientX, y: event.clientY }, trigger);
    }
  };
  return (
    <motion.div className="itinerary-film-frame" whileHover={{ y: -4 }} transition={{ duration: 0.18 }} onContextMenu={openMenu}>
      <div className="itinerary-film-frame-label">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <span>{photo.source === 'meal' ? photo.label : 'TRAVEL MEMORY'}</span>
      </div>
      {canEdit && <button type="button" className="itinerary-film-frame-menu-button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onMenu(photo, { x: event.clientX, y: event.clientY }, event.currentTarget); }} aria-label="照片操作" title="照片操作"><ActionIcon name="more" size={18} /></button>}
      <button type="button" className="itinerary-film-image-button" onClick={() => { if (interactionMode === 'pointer') onOpen(photo); }}>
        <ZoomableFilmImage photo={photo} format={format} interactionMode={interactionMode} onLockChange={onLockChange} loading="eager" frameIndex={index + 1} page={page} roll={roll} />
      </button>
      <div className="itinerary-film-frame-meta">
        <span className="itinerary-film-frame-number">{index + 1}</span>
        {photo.source === 'photo' && <button type="button" onClick={(event) => onRemove(photo, event.currentTarget)} aria-label="删除照片" title="删除照片"><ActionIcon name="trash" size={16} /></button>}
      </div>
    </motion.div>
  );
}

function FilmStrip({ photos, format, rollIndex, totalRolls, direction, reduceMotion, tripId, interactionMode, onNext, onPrev, onOpen, onRemove, onMenu, onLockChange, onTransitionComplete }) {
  const rolls = getRolls(photos, format);
  const visibleRolls = rolls.slice(rollIndex, rollIndex + ROLLS_PER_PAGE);
  return (
    <div className="itinerary-film-viewport">
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={tripId + '-' + format.className + '-' + rollIndex}
          className={'itinerary-film-roll-page ' + format.className}
          custom={direction}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * 90 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -90 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.56, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={onTransitionComplete}
          drag={reduceMotion ? false : 'x'}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.13}
          onDragEnd={(_, info) => {
            if (info.offset.x < -60 || info.velocity.x < -500) onNext();
            if (info.offset.x > 60 || info.velocity.x > 500) onPrev();
          }}
        >
          {visibleRolls.map((roll, pageOffset) => {
            const actualRollIndex = rollIndex + pageOffset;
            return (
              <div className="itinerary-film-strip" key={tripId + '-roll-' + actualRollIndex}>
                <div className="itinerary-film-edge itinerary-film-edge-top" aria-hidden="true">{Array.from({ length: 26 }).map((_, index) => <span key={index} />)}</div>
                <div className="itinerary-film-edge-label top">{format.edge} / TRAVEL MEMORY</div>
                <div className="itinerary-film-frame-grid" style={{ '--film-columns': format.columns }}>
      {roll.map((photo, index) => <FilmFrame key={photo.id} photo={photo} index={actualRollIndex * format.perRoll + index} page={Math.floor(rollIndex / ROLLS_PER_PAGE) + 1} roll={actualRollIndex + 1} format={format} interactionMode={interactionMode} onOpen={onOpen} onRemove={onRemove} onMenu={onMenu} onLockChange={onLockChange} />)}
                </div>
                <div className="itinerary-film-edge-label bottom">ROLL {String(actualRollIndex + 1).padStart(2, '0')} / {String(totalRolls).padStart(2, '0')}</div>
                <div className="itinerary-film-edge itinerary-film-edge-bottom" aria-hidden="true">{Array.from({ length: 26 }).map((_, index) => <span key={index} />)}</div>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}function ExportDialog({ open, settings, setSettings, onClose, onExport, status }) {
  if (!open) return null;
  return (
    <div className="itinerary-film-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="itinerary-film-export-dialog" role="dialog" aria-modal="true" aria-labelledby="film-export-title" onClick={(event) => event.stopPropagation()}>
        <div className="itinerary-film-dialog-head">
          <div><span className="itinerary-film-kicker">DARKROOM OUTPUT</span><h3 id="film-export-title">导出索引图</h3></div>
          <button type="button" className="itinerary-film-icon-button" onClick={onClose} aria-label="关闭导出窗口"><ActionIcon name="close" /></button>
        </div>
        <div className="itinerary-film-export-grid">
          <label>范围<select value={settings.scope} onChange={(event) => setSettings({ ...settings, scope: event.target.value })}><option value="roll">当前卷</option><option value="day">当前日期全部胶片卷</option><option value="trip">当前旅程全部胶片卷</option></select></label>
          <label>格式<select value={settings.format} onChange={(event) => setSettings({ ...settings, format: event.target.value })}><option value="png">PNG</option><option value="jpg">JPG</option></select></label>
          <label>质量<select value={settings.quality} onChange={(event) => setSettings({ ...settings, quality: event.target.value })}><option value="standard">标准</option><option value="high">高清</option><option value="original">原始质量</option></select></label>
          <label>尺寸<select value={settings.size} onChange={(event) => setSettings({ ...settings, size: event.target.value })}><option value="web">网页尺寸</option><option value="2k">2K</option><option value="4k">4K</option></select></label>
        </div>
        <div className="itinerary-film-export-checks">
          <label><input type="checkbox" checked={settings.includeMeta} onChange={(event) => setSettings({ ...settings, includeMeta: event.target.checked })} /> 边缘文字</label>
          <label><input type="checkbox" checked={settings.includeDate} onChange={(event) => setSettings({ ...settings, includeDate: event.target.checked })} /> 日期</label>
          <label><input type="checkbox" checked={settings.includeLocation} onChange={(event) => setSettings({ ...settings, includeLocation: event.target.checked })} /> 地点</label>
          <label><input type="checkbox" checked={settings.includeRoll} onChange={(event) => setSettings({ ...settings, includeRoll: event.target.checked })} /> 卷号</label>
          <label><input type="checkbox" checked={settings.includeFrame} onChange={(event) => setSettings({ ...settings, includeFrame: event.target.checked })} /> 帧编号</label>
        </div>
        {status && <p className="itinerary-film-export-status" role="status">{status}</p>}
        <button type="button" className="itinerary-film-primary-button" onClick={onExport}>生成并下载</button>
      </section>
    </div>
  );
}

export default function ItineraryFilmView({ location, initialTripId = null }) {
  const { addTrip, deleteTrip, deleteDay, addTripPhoto, updateTripPhoto, movePhotoToDay, removeTripPhoto, updateBlockData, flushStorage, saveState, storageStatus } = useTravel();
  const reduceMotion = useReducedMotion();
  const journeyGroups = useMemo(() => getJourneyGroups(location), [location]);
  const days = useMemo(() => journeyGroups.flatMap((group) => group.days), [journeyGroups]);
  const initialTripGroup = journeyGroups.find((group) => group.trip.id === initialTripId);
  const initialTripHasNoDay = Boolean(initialTripGroup && !initialTripGroup.days.length);
  const initialDayId = initialTripGroup ? initialTripGroup.days[0]?.day.id || null : days[0]?.day.id || null;
  const [activeDayId, setActiveDayId] = useState(() => initialDayId);
  const initializedTripIdRef = useRef(initialTripId);
  const [formatKey, setFormatKey] = useState('standard135');
  const [photoScope, setPhotoScope] = useState('day');
  const [lightTableMode, setLightTableMode] = useState(false);
  const [rollIndex, setRollIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [photoInteractionMode, setPhotoInteractionMode] = useState('pointer');
  const [magnifierLocked, setMagnifierLocked] = useState(false);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [isEditingRecord, setIsEditingRecord] = useState(false);
  const [reflectionDraft, setReflectionDraft] = useState('');
  const [journeyDraft, setJourneyDraft] = useState('');
  const [moodNoteDraft, setMoodNoteDraft] = useState('');
  const [isReflectionOpen, setIsReflectionOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [exportSettings, setExportSettings] = useState({ scope: 'roll', format: 'png', quality: 'standard', size: 'web', includeMeta: true, includeFrame: true, includeDate: true, includeLocation: true, includeRoll: true });
  const [showTripForm, setShowTripForm] = useState(false);
  const [tripName, setTripName] = useState('');
  const [expandedJourneyIds, setExpandedJourneyIds] = useState(() => new Set());
  const [pendingTripId, setPendingTripId] = useState(null);
  const [isRollAnimating, setIsRollAnimating] = useState(false);
  const [dateError, setDateError] = useState('');
  const [frameMenu, setFrameMenu] = useState(null);
  const [photoToMove, setPhotoToMove] = useState(null);
  const [photoMoveTargetDayId, setPhotoMoveTargetDayId] = useState('');
  const [isMovingPhoto, setIsMovingPhoto] = useState(false);
  const [photoMoveFailed, setPhotoMoveFailed] = useState(false);
  const [cropPhoto, setCropPhoto] = useState(null);
  const [filmNotice, setFilmNotice] = useState('');
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const cropReturnModeRef = useRef('pointer');
  const queuedRollRef = useRef(0);
  const filmNoticeTimerRef = useRef(0);
  const uploadStatusTimerRef = useRef(0);
  const uploadBusyRef = useRef(false);
  const rollTransitionFrameRef = useRef(0);
  const journalSaveTimerRef = useRef(0);
  const journalSavePromiseRef = useRef(null);
  const journalDraftRef = useRef(null);
  const journalSavedDraftRef = useRef(null);
  const daySwitchBusyRef = useRef(false);
  const [tripStart, setTripStart] = useState('');
  const [tripEnd, setTripEnd] = useState('');
  const uploadRef = useRef(null);
  const filmPerformanceRef = useRef(null);

  const activeEntry = days.find((entry) => entry.day.id === activeDayId) || (initialTripHasNoDay ? null : days[0] || null);
  const activeJourneyId = activeEntry?.trip?.id || null;
  const activeDay = activeEntry?.day || null;
  const activeTrip = activeEntry?.trip || (initialTripHasNoDay ? initialTripGroup.trip : null);
  const isUploadReady = Boolean(activeDay && activeTrip?.days?.some((day) => day.id === activeDay.id));
  useEffect(() => {
    if (!initialTripId || initializedTripIdRef.current === initialTripId) return;
    const targetTrip = journeyGroups.find((group) => group.trip.id === initialTripId);
    const targetDayId = targetTrip?.days[0]?.day.id;
    if (!targetDayId) return;
    initializedTripIdRef.current = initialTripId;
    setActiveDayId(targetDayId);
    setPhotoScope('day');
    setRollIndex(0);
  }, [initialTripId, journeyGroups]);
  const format = FORMAT_OPTIONS[formatKey];
  const tripPhotos = useMemo(() => getTripPhotos(activeTrip), [activeTrip]);
  useEffect(() => {
    if (!import.meta.env.DEV || !activeJourneyId || filmPerformanceRef.current?.tripId === activeJourneyId) return;
    filmPerformanceRef.current = { tripId: activeJourneyId, firstImageLoaded: false };
    performance.mark('travel-memory:film-enter');
    console.info('[Travel Memory performance] Film opened', {
      photoCount: tripPhotos.length,
      enteredAt: new Date().toISOString(),
    });
  }, [activeJourneyId, tripPhotos.length]);

  const handleFilmImageLoad = useCallback((event) => {
    if (!import.meta.env.DEV || !event.target?.matches?.('.itinerary-film-image')) return;
    const filmPerformance = filmPerformanceRef.current;
    if (!filmPerformance || filmPerformance.tripId !== activeJourneyId || filmPerformance.firstImageLoaded) return;
    filmPerformance.firstImageLoaded = true;
    performance.mark('travel-memory:film-first-image-loaded');
    const measure = performance.measure(
      'travel-memory:film-first-image',
      'travel-memory:film-enter',
      'travel-memory:film-first-image-loaded',
    );
    console.info('[Travel Memory performance] Film first image loaded', {
      durationMs: Math.round(measure.duration),
      photoCount: tripPhotos.length,
    });
  }, [activeJourneyId, tripPhotos.length]);
  const activeTripDayIds = useMemo(() => new Set((activeTrip?.days || []).map((day) => day.id)), [activeTrip]);
  const activeDayPhotos = useMemo(() => tripPhotos.filter((photo) => photo.dayId === activeDay?.id), [activeDay?.id, tripPhotos]);
  const unfiledPhotos = useMemo(() => tripPhotos.filter((photo) => !photo.dayId || !activeTripDayIds.has(photo.dayId)), [activeTripDayIds, tripPhotos]);
  const photos = photoScope === 'unfiled' ? unfiledPhotos : activeDayPhotos;
  const isEmptyTrip = Boolean(activeTrip && activeDay && tripPhotos.length === 0);
  const rolls = useMemo(() => getRolls(photos, format), [photos, format]);
  const itinerary = getBlock(activeDay, 'itinerary');
  const feeling = getBlock(activeDay, 'feeling');
  const companions = getBlock(activeDay, 'companions');
  const music = getBlock(activeDay, 'music');
  const journeyText = getJourneyProcessText(itinerary);
  const reflection = feeling?.data?.text || getBlock(activeDay, 'text')?.data?.text || '';
  const moods = Array.isArray(feeling?.data?.mood) ? feeling.data.mood : [];
  const moodNote = feeling?.data?.moodNote || '';
  const weather = getJournalWeather(activeDay, location);
  const activeDayNumber = Math.max(1, days.findIndex((entry) => entry.day.id === activeDay?.id) + 1);
  const maxRollStart = Math.max(0, Math.floor(Math.max(rolls.length - 1, 0) / ROLLS_PER_PAGE) * ROLLS_PER_PAGE);
  const visibleRollEnd = Math.min(rollIndex + ROLLS_PER_PAGE, rolls.length);
  const totalRollPages = Math.max(1, Math.ceil(rolls.length / ROLLS_PER_PAGE));
  const rollRangeText = rolls.length ? String(rollIndex + 1).padStart(2, '0') + '-' + String(visibleRollEnd).padStart(2, '0') : '--';
  const rollPageText = String(Math.floor(rollIndex / ROLLS_PER_PAGE) + 1).padStart(2, '0') + ' / ' + String(totalRollPages).padStart(2, '0');
  const savePresentation = getSaveStatusPresentation(saveState, storageStatus);
  const saveStatusLabel = savePresentation?.label || '';
  const saveJournalDrafts = useCallback(async (dayId, draft) => {
    const entry = days.find((item) => item.day.id === dayId);
    if (!entry || !draft || draft.dayId !== dayId) return false;
    const savedDraft = {
      dayId,
      journey: draft.journey.trim(),
      moodNote: draft.moodNote.trim(),
      reflection: draft.reflection.trim(),
    };
    const pendingSave = journalSavePromiseRef.current;
    if (pendingSave) {
      await pendingSave;
      const lastSaved = journalSavedDraftRef.current;
      if (lastSaved?.dayId === dayId
        && lastSaved.journey.trim() === savedDraft.journey
        && lastSaved.moodNote.trim() === savedDraft.moodNote
        && lastSaved.reflection.trim() === savedDraft.reflection) return true;
    }
    const savePromise = (async () => {
      const dayItinerary = getBlock(entry.day, 'itinerary');
      const dayFeeling = getBlock(entry.day, 'feeling');
      if (dayItinerary) updateBlockData(location.id, dayId, dayItinerary.id, { journeyText: savedDraft.journey, journeyTextMigrated: true });
      if (dayFeeling) updateBlockData(location.id, dayId, dayFeeling.id, { moodNote: savedDraft.moodNote, text: savedDraft.reflection });
      if (dayItinerary || dayFeeling) {
        // Let React commit the updated blocks before Context snapshots locationsRef for persistence.
        await new Promise((resolve) => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));
        const success = await flushStorage();
        if (!success) return false;
      }
      journalSavedDraftRef.current = savedDraft;
      return true;
    })();
    journalSavePromiseRef.current = savePromise;
    try {
      return await savePromise;
    } finally {
      if (journalSavePromiseRef.current === savePromise) journalSavePromiseRef.current = null;
    }
  }, [days, flushStorage, location.id, updateBlockData]);
  const goToRoll = useCallback((delta) => {
    if (!rolls.length) return;
    if (isRollAnimating) {
      queuedRollRef.current = delta > 0 ? 1 : -1;
      return;
    }
    const maxRollStart = Math.max(0, Math.floor(Math.max(rolls.length - 1, 0) / ROLLS_PER_PAGE) * ROLLS_PER_PAGE);
    const pageStep = delta > 0 ? ROLLS_PER_PAGE : -ROLLS_PER_PAGE;
    const next = Math.max(0, Math.min(rollIndex + pageStep, maxRollStart));
    if (next === rollIndex) return;
    queuedRollRef.current = 0;
    setDirection(delta > 0 ? 1 : -1);
    setRollIndex(next);
    setIsRollAnimating(true);
  }, [isRollAnimating, rollIndex, rolls.length]);

  const handleRollTransitionComplete = useCallback(() => {
    setIsRollAnimating(false);
    const queued = queuedRollRef.current;
    queuedRollRef.current = 0;
    if (queued) {
      rollTransitionFrameRef.current = requestAnimationFrame(() => {
        rollTransitionFrameRef.current = 0;
        goToRoll(queued);
      });
    }
  }, [goToRoll]);

  useEffect(() => () => {
    if (filmNoticeTimerRef.current) window.clearTimeout(filmNoticeTimerRef.current);
    if (uploadStatusTimerRef.current) window.clearTimeout(uploadStatusTimerRef.current);
    if (rollTransitionFrameRef.current) cancelAnimationFrame(rollTransitionFrameRef.current);
  }, []);


  useEffect(() => {
    if (!days.some((entry) => entry.day.id === activeDayId)) setActiveDayId(initialTripHasNoDay ? null : days[0]?.day.id || null);
  }, [days, activeDayId, initialTripHasNoDay]);

  useEffect(() => {
    if (!pendingTripId) return;
    const group = journeyGroups.find((item) => item.trip.id === pendingTripId);
    if (!group) return;
    setExpandedJourneyIds((current) => current.has(pendingTripId) ? current : new Set([...current, pendingTripId]));
    setActiveDayId(group.days[0]?.day.id || null);
    setPendingTripId(null);
  }, [journeyGroups, pendingTripId]);

  useEffect(() => {
    if (!activeJourneyId) return;
    setExpandedJourneyIds((current) => current.has(activeJourneyId) ? current : new Set([...current, activeJourneyId]));
  }, [activeJourneyId]);

  useEffect(() => {
    setRollIndex(0);
    setDirection(1);
    setIsEditingRecord(false);
    setIsJournalOpen(false);
    setSelectedPhoto(null);
    setFrameMenu(null);
    setCropPhoto(null);
    setIsRollAnimating(false);
    queuedRollRef.current = 0;
  }, [activeJourneyId]);

  useEffect(() => {
    const maxRollStart = Math.max(0, Math.floor(Math.max(rolls.length - 1, 0) / ROLLS_PER_PAGE) * ROLLS_PER_PAGE);
    setRollIndex((current) => Math.min(current, maxRollStart));
  }, [rolls.length]);

  useEffect(() => {
    const incoming = { dayId: activeDayId, journey: journeyText, moodNote, reflection };
    const current = journalDraftRef.current;
    const saved = journalSavedDraftRef.current;
    const hasUnsavedCurrentDraft = current?.dayId === activeDayId
      && saved?.dayId === activeDayId
      && (current.journey.trim() !== saved.journey.trim()
        || current.moodNote.trim() !== saved.moodNote.trim()
        || current.reflection.trim() !== saved.reflection.trim());
    if (hasUnsavedCurrentDraft) return;
    journalDraftRef.current = incoming;
    journalSavedDraftRef.current = incoming;
    setJourneyDraft(incoming.journey);
    setMoodNoteDraft(incoming.moodNote);
    setReflectionDraft(incoming.reflection);
    setIsReflectionOpen(Boolean(reflection.trim()));
  }, [activeDayId, journeyText, moodNote, reflection]);

  useEffect(() => {
    if (journalSaveTimerRef.current) window.clearTimeout(journalSaveTimerRef.current);
    journalSaveTimerRef.current = 0;
    if (!isEditingRecord || !activeDayId) return undefined;
    const snapshot = journalDraftRef.current;
    const saved = journalSavedDraftRef.current;
    if (!snapshot || snapshot.dayId !== activeDayId) return undefined;
    const isDirty = !saved || saved.dayId !== activeDayId
      || snapshot.journey.trim() !== saved.journey.trim()
      || snapshot.moodNote.trim() !== saved.moodNote.trim()
      || snapshot.reflection.trim() !== saved.reflection.trim();
    if (!isDirty) return undefined;
    journalSaveTimerRef.current = window.setTimeout(() => {
      journalSaveTimerRef.current = 0;
      const latest = journalDraftRef.current;
      if (latest?.dayId === activeDayId) void saveJournalDrafts(activeDayId, latest);
    }, 800);
    return () => {
      if (journalSaveTimerRef.current) window.clearTimeout(journalSaveTimerRef.current);
      journalSaveTimerRef.current = 0;
    };
  }, [activeDayId, isEditingRecord, journeyDraft, moodNoteDraft, reflectionDraft, saveJournalDrafts]);

  useEffect(() => () => {
    if (journalSaveTimerRef.current) window.clearTimeout(journalSaveTimerRef.current);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToRoll(1);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToRoll(-1);
      }
      if (event.key === 'Escape') {
        if (cropPhoto) {
          setCropPhoto(null);
          setPhotoInteractionMode(cropReturnModeRef.current);
          window.dispatchEvent(new Event('itinerary:reset-film-zoom'));
        } else if (frameMenu) setFrameMenu(null);
        else if (selectedPhoto) setSelectedPhoto(null);
        else if (exportOpen) setExportOpen(false);
        else if (photoInteractionMode === 'magnifier' && magnifierLocked) {
          window.dispatchEvent(new Event('itinerary:reset-film-zoom'));
          setMagnifierLocked(false);
        } else if (photoInteractionMode === 'magnifier') {
          window.dispatchEvent(new Event('itinerary:reset-film-zoom'));
          setPhotoInteractionMode('pointer');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cropPhoto, exportOpen, frameMenu, magnifierLocked, photoInteractionMode, selectedPhoto, goToRoll]);

  useEffect(() => {
    if (!photos.length || rolls.length < 2) return undefined;
    const maxRollStart = Math.max(0, Math.floor(Math.max(rolls.length - 1, 0) / ROLLS_PER_PAGE) * ROLLS_PER_PAGE);
    const previousPageStart = Math.max(0, rollIndex - ROLLS_PER_PAGE);
    const nextPageStart = Math.min(maxRollStart, rollIndex + ROLLS_PER_PAGE);
    const hasPreviousPage = previousPageStart < rollIndex;
    const hasNextPage = nextPageStart > rollIndex;
    const preferredPageStart = direction >= 0 ? nextPageStart : previousPageStart;
    const adjacentPageStart = preferredPageStart !== rollIndex
      ? preferredPageStart
      : direction >= 0 && hasPreviousPage
        ? previousPageStart
        : hasNextPage
          ? nextPageStart
          : previousPageStart;
    if (adjacentPageStart === rollIndex) return undefined;

    let active = true;
    rolls.slice(adjacentPageStart, adjacentPageStart + ROLLS_PER_PAGE).flat().forEach((photo) => {
      const assetId = photo.assetId || photo.id;
      const load = photo.url ? Promise.resolve(photo.url) : getPhotoObjectUrl(assetId);
      load.then((url) => {
        if (active && url) preloadFilmImage(url, assetId);
      });
    });
    return () => { active = false; };
  }, [direction, photos, rollIndex, rolls]);




  const updateJournalDraft = (field, value) => {
    const current = journalDraftRef.current || { dayId: activeDayId, journey: journeyText, moodNote, reflection };
    const next = { ...current, dayId: activeDayId, [field]: value };
    journalDraftRef.current = next;
    if (field === 'journey') setJourneyDraft(value);
    if (field === 'moodNote') setMoodNoteDraft(value);
    if (field === 'reflection') setReflectionDraft(value);
  };

  const handleDaySelect = async (dayId) => {
    if (dayId === activeDayId) return;
    if (daySwitchBusyRef.current) return;
    const nextEntry = days.find((entry) => entry.day.id === dayId);
    if (!nextEntry) return;
    daySwitchBusyRef.current = true;
    if (journalSaveTimerRef.current) window.clearTimeout(journalSaveTimerRef.current);
    journalSaveTimerRef.current = 0;
    const draft = journalDraftRef.current;
    const saved = journalSavedDraftRef.current;
    const hasUnsavedDraft = draft?.dayId === activeDayId
      && (!saved || saved.dayId !== activeDayId
        || draft.journey.trim() !== saved.journey.trim()
        || draft.moodNote.trim() !== saved.moodNote.trim()
        || draft.reflection.trim() !== saved.reflection.trim());
    if (hasUnsavedDraft) {
      const success = await saveJournalDrafts(activeDayId, draft);
      if (!success) {
        notifyFilm('当前内容保存失败，请重试。');
        daySwitchBusyRef.current = false;
        return;
      }
    }
    setActiveDayId(dayId);
    setPhotoScope('day');
    setRollIndex(0);
    setDirection(1);
    setExpandedJourneyIds((current) => nextEntry?.trip?.id && !current.has(nextEntry.trip.id) ? new Set([...current, nextEntry.trip.id]) : current);
    setDateError('');
    daySwitchBusyRef.current = false;
  };

  const handleFormatChange = (nextKey) => {
    const currentPhoto = rolls[rollIndex]?.[0];
    const nextFormat = FORMAT_OPTIONS[nextKey];
    const nextRolls = getRolls(photos, nextFormat);
    const nextIndex = currentPhoto ? nextRolls.findIndex((roll) => roll.some((photo) => photo.id === currentPhoto.id)) : 0;
    queuedRollRef.current = 0;
    setIsRollAnimating(false);
    setFrameMenu(null);
    setCropPhoto(null);
    setFormatKey(nextKey);
    setRollIndex(Math.floor(Math.max(0, nextIndex) / ROLLS_PER_PAGE) * ROLLS_PER_PAGE);
  };

  const processUploadFiles = async (files, {
    previousFailures = [],
    successCount = 0,
    dayId = activeDay?.id,
    tripId = activeTrip?.id,
    locationId = location.id,
  } = {}) => {
    if (!tripId || !dayId || uploadBusyRef.current || !files.length) return;
    uploadBusyRef.current = true;
    if (uploadStatusTimerRef.current) window.clearTimeout(uploadStatusTimerRef.current);
    uploadStatusTimerRef.current = 0;
    if (filmNoticeTimerRef.current) window.clearTimeout(filmNoticeTimerRef.current);
    setFilmNotice('');

    let completedCount = successCount;
    const failures = [...previousFailures];
    const updateStatus = (status, current, extra = {}) => {
      setUploadStatus({
        uploading: true,
        status,
        current,
        total: files.length,
        successCount: completedCount,
        failures: [...failures],
        ...extra,
      });
    };

    try {
      updateStatus('processing', 1);
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        let stage = 'processing';
        updateStatus('processing', index + 1);
        try {
          const compressed = await compressImage(file);
          stage = 'saving';
          updateStatus('saving', index + 1);
          const persisted = await addTripPhoto(locationId, tripId, { ...compressed, date: '', source: 'photo', dayId });
          if (persisted !== true) throw new Error('照片尚未完成持久化，请重试保存');
          completedCount += 1;
        } catch (error) {
          console.warn('[TravelMemory] 行程照片上传失败', error);
          failures.push({ file, stage, message: error?.message || '照片保存失败', dayId, tripId, locationId });
        }
        updateStatus(index === files.length - 1 ? (failures.length ? 'error' : 'success') : 'processing', index + 1);
      }

      const finalStatus = failures.length ? 'error' : 'success';
      setUploadStatus({
        uploading: false,
        status: finalStatus,
        current: files.length,
        total: files.length,
        successCount: completedCount,
        failures,
      });
      if (finalStatus === 'success') {
        uploadStatusTimerRef.current = window.setTimeout(() => {
          uploadStatusTimerRef.current = 0;
          setUploadStatus(null);
        }, 2400);
      }
    } finally {
      uploadBusyRef.current = false;
    }
  };

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    event.target.value = '';
    if (!files.length) return;
    if (!isUploadReady) {
      notifyFilm('请先选择或创建 Day，再上传照片。');
      return;
    }
    const previousErrors = uploadStatus?.status === 'error' ? uploadStatus : null;
    await processUploadFiles(files, {
      previousFailures: previousErrors?.failures || [],
      successCount: previousErrors?.successCount || 0,
        dayId: activeDay.id,
        tripId: activeTrip.id,
      locationId: location.id,
    });
  };

  const retryFailedUpload = async (failedUpload) => {
    if (!uploadStatus || uploadBusyRef.current || !failedUpload) return;
    const remainingFailures = uploadStatus.failures.filter((item) => item !== failedUpload);
    if (failedUpload.stage === 'processing') {
      await processUploadFiles([failedUpload.file], {
        previousFailures: remainingFailures,
        successCount: uploadStatus.successCount,
        dayId: failedUpload.dayId || activeDay?.id,
        tripId: failedUpload.tripId || activeTrip?.id,
        locationId: failedUpload.locationId || location.id,
      });
      return;
    }

    uploadBusyRef.current = true;
    if (uploadStatusTimerRef.current) window.clearTimeout(uploadStatusTimerRef.current);
    uploadStatusTimerRef.current = 0;
    setUploadStatus({ ...uploadStatus, uploading: true, status: 'saving' });
    try {
      const persisted = await flushStorage();
      if (persisted === false) throw new Error('照片仍未保存，请稍后重试');
      const saveFailures = uploadStatus.failures.filter((item) => item.stage === 'saving');
      const failures = uploadStatus.failures.filter((item) => item.stage !== 'saving');
      const successCount = uploadStatus.successCount + saveFailures.length;
      const status = failures.length ? 'error' : 'success';
      setUploadStatus({
        ...uploadStatus,
        uploading: false,
        status,
        successCount,
        failures,
      });
      if (status === 'success') {
        uploadStatusTimerRef.current = window.setTimeout(() => {
          uploadStatusTimerRef.current = 0;
          setUploadStatus(null);
        }, 2400);
      }
    } catch (error) {
      console.warn('[TravelMemory] 行程照片重试保存失败', error);
      setUploadStatus({ ...uploadStatus, uploading: false, status: 'error' });
    } finally {
      uploadBusyRef.current = false;
    }
  };

  const handleRemovePhoto = (photo, returnFocusTarget) => {
    if (!activeTrip || !photo?.id) return;
    setFrameMenu(null);
    setDeleteRequest({
      kind: 'photo',
      tripId: activeTrip.id,
      photoId: photo.id,
      title: '删除照片',
      description: `确认从「${activeTrip.name || location.name + '之旅'}」中删除「${photo.label || '这张照片'}」？此操作无法撤销。`,
      returnFocusTarget,
    });
  };

  const confirmPendingDelete = () => {
    if (!deleteRequest) return;
    const request = deleteRequest;
    setDeleteRequest(null);
    if (request.kind === 'photo') {
      removeTripPhoto(location.id, request.tripId, request.photoId);
      setSelectedPhoto(null);
      setFilmNotice('照片已删除');
    } else if (request.kind === 'day') {
      deleteDay(location.id, request.tripId, request.dayId);
    } else if (request.kind === 'trip') {
      deleteTrip(location.id, request.tripId);
    }
  };

  const notifyFilm = (message) => {
    setFilmNotice(message);
    if (filmNoticeTimerRef.current) window.clearTimeout(filmNoticeTimerRef.current);
    filmNoticeTimerRef.current = window.setTimeout(() => {
      filmNoticeTimerRef.current = 0;
      setFilmNotice('');
    }, 1800);
  };

  const updatePhotoEdits = (photo, updates) => {
    if (!activeTrip || !photo?.id) return;
    updateTripPhoto(location.id, activeTrip.id, photo.id, updates);
  };

  const closeCropEditor = () => {
    setCropPhoto(null);
    setPhotoInteractionMode(cropReturnModeRef.current);
    window.dispatchEvent(new Event('itinerary:reset-film-zoom'));
  };

  const openFrameMenu = (photo, position, returnFocusTarget) => {
    if (!photo?.id) return;
    setFrameMenu({ photo, position, returnFocusTarget });
  };

  const openPhotoMoveDialog = (photo) => {
    if (!photo?.id || photo.source === 'meal' || !activeTrip) return;
    const targetDay = (activeTrip.days || []).find((day) => day.id !== photo.dayId);
    if (!targetDay) return;
    setPhotoMoveTargetDayId(activeDay?.id !== photo.dayId && activeDay ? activeDay.id : targetDay.id);
    setPhotoMoveFailed(false);
    setPhotoToMove(photo);
    setFrameMenu(null);
  };

  const handleMovePhoto = async () => {
    if (!photoToMove || !activeTrip || isMovingPhoto) return;
    const targetDay = activeTrip.days?.find((day) => day.id === photoMoveTargetDayId);
    if (!targetDay || targetDay.id === photoToMove.dayId) {
      setPhotoMoveFailed(true);
      return;
    }
    setIsMovingPhoto(true);
    setPhotoMoveFailed(false);
    try {
      const saved = await movePhotoToDay(location.id, activeTrip.id, photoToMove.id, targetDay.id);
      if (!saved) {
        setPhotoMoveFailed(true);
        return;
      }
      setPhotoToMove(null);
      notifyFilm('照片已整理到 ' + formatDate(targetDay.date));
    } catch (error) {
      console.warn('[TravelMemory] 照片整理失败', error);
      setPhotoMoveFailed(true);
    } finally {
      setIsMovingPhoto(false);
    }
  };

  const handleOpenCrop = (photo) => {
    if (!photo?.id) return;
    cropReturnModeRef.current = photoInteractionMode;
    setFrameMenu(null);
    setMagnifierLocked(false);
    window.dispatchEvent(new Event('itinerary:reset-film-zoom'));
    setPhotoInteractionMode('pointer');
    setCropPhoto(photo);
  };

  const handleApplyCrop = (crop) => {
    if (!cropPhoto) return;
    updatePhotoEdits(cropPhoto, { crop: normalizeCrop(crop) });
    closeCropEditor();
    notifyFilm('裁切已应用');
  };

  const handleRestoreOriginal = () => {
    if (!cropPhoto) return;
    updatePhotoEdits(cropPhoto, { rotation: 0, crop: null });
    closeCropEditor();
    notifyFilm('已恢复原图');
  };

  const handleRotatePhoto = (photo) => {
    if (!photo?.id) return;
    const nextRotation = (normalizeRotation(photo.rotation) + 90) % 360;
    const nextCrop = photo.crop ? rotateCropClockwise(photo.crop) : null;
    updatePhotoEdits(photo, { rotation: nextRotation, crop: nextCrop });
    setFrameMenu(null);
    notifyFilm('已旋转90°');
  };

  const resetTripForm = () => {
    setTripName('');
    setTripStart('');
    setTripEnd('');
    setDateError('');
  };

  const handleCreateTrip = () => {
    if (!tripStart || !tripEnd || tripEnd < tripStart) {
      setDateError('请选择有效的出发日期和返回日期');
      return;
    }
    const monthLabel = tripStart.slice(0, 7).replace('-', '年') + '月';
    const resolvedName = tripName.trim() || (location.name + '之旅 · ' + monthLabel);
    const createdTripId = addTrip(location.id, tripStart, tripEnd, resolvedName);
    setPendingTripId(createdTripId);
    resetTripForm();
    setShowTripForm(false);
  };

  const handleDateRangeChange = (startDate, endDate) => {
    setTripStart(startDate);
    setTripEnd(endDate);
    setDateError('');
  };

  const toggleJourney = (journeyId) => {
    setExpandedJourneyIds((current) => {
      const next = new Set(current);
      if (next.has(journeyId)) next.delete(journeyId);
      else next.add(journeyId);
      return next;
    });
  };

  const handleInteractionModeChange = (mode) => {
    setPhotoInteractionMode(mode);
    setMagnifierLocked(false);
    window.dispatchEvent(new Event('itinerary:reset-film-zoom'));
  };

  const handleMagnifierLockChange = (locked) => {
    setMagnifierLocked(locked);
  };

  const handleSaveJournal = async () => {
    if (!activeDay) return;
    if (journalSaveTimerRef.current) window.clearTimeout(journalSaveTimerRef.current);
    journalSaveTimerRef.current = 0;
    const draft = journalDraftRef.current || { dayId: activeDay.id, journey: journeyDraft, moodNote: moodNoteDraft, reflection: reflectionDraft };
    const success = await saveJournalDrafts(activeDay.id, draft);
    if (!success) {
      notifyFilm('当前内容保存失败，请重试。');
      return;
    }
    setIsEditingRecord(false);
    setIsReflectionOpen(Boolean(draft.reflection.trim()));
  };
  const toggleMood = (mood) => {
    if (!feeling || !activeDay) return;
    const nextMoods = moods.includes(mood) ? moods.filter((item) => item !== mood) : [...moods, mood];
    updateBlockData(location.id, activeDay.id, feeling.id, { mood: nextMoods });
  };

  const handleExport = async () => {
    if (!(exportSettings.scope === 'trip' ? tripPhotos : photos).length) {
      setExportStatus('当前旅程还没有可导出的照片');
      return;
    }
    setExportStatus('正在生成胶片索引图…');
    try {
      const exportPhotos = exportSettings.scope === 'trip' ? tripPhotos : photos;
      const records = exportSettings.scope === 'roll'
        ? [{ entry: activeEntry, rolls: [rolls[rollIndex] || []] }]
        : [{ entry: activeEntry, rolls: getRolls(exportPhotos, format) }];
      let exported = 0;
      for (const record of records) {
        for (let index = 0; index < record.rolls.length; index += 1) {
          const result = await createFilmExport(record.rolls[index], format, exportSettings, index, { location: location.name, date: formatDate(record.entry.day.date) });
          const datePart = (record.entry.day.date || 'travel').replaceAll('-', '');
          downloadDataUrl(result.url, location.name + '-' + datePart + '-roll-' + String(index + 1).padStart(2, '0') + '.' + result.extension);
          exported += 1;
          setExportStatus('已生成 ' + exported + ' 张胶片索引图');
        }
      }
      setExportStatus('完成，共下载 ' + exported + ' 张胶片索引图');
    } catch (error) {
      console.error('[TravelMemory] 胶片索引图导出失败', error);
      setExportStatus('导出失败，请降低尺寸或换用 PNG 格式重试');
    }
  };

  return (
    <div className={'itinerary-film-page ' + (isEmptyTrip ? 'is-trip-empty' : '') + (isEmptyTrip && isJournalOpen ? ' is-journal-open' : '')}>
      <aside className="itinerary-film-timeline" aria-label="旅行日期">
        <div className="itinerary-film-sidebar-head">
          <span className="itinerary-film-kicker">TRAVEL INDEX</span>
          <h2>行程</h2>
          <span>{journeyGroups.length ? journeyGroups.length + ' 段旅程 · ' + days.length + ' 个日期' : '还没有旅程'}</span>
        </div>
        <div className="itinerary-film-day-list">
          {journeyGroups.length ? journeyGroups.map((group) => {
            const isExpanded = expandedJourneyIds.has(group.trip.id);
            const dayCount = group.days.length;
            const tripPhotosInGroup = getTripPhotos(group.trip);
            const dayPhotoCounts = new Map();
            tripPhotosInGroup.forEach((photo) => {
              if (photo.dayId) dayPhotoCounts.set(photo.dayId, (dayPhotoCounts.get(photo.dayId) || 0) + 1);
            });
            const fallbackName = location.name + '之旅 · ' + (group.startDate ? group.startDate.slice(0, 7).replace('-', '年') + '月' : '未定日期');
            const destinations = Array.isArray(group.trip.destinations) && group.trip.destinations.length ? group.trip.destinations.join(' · ') : location.name;
            return (
              <section key={group.trip.id} className={'itinerary-film-journey-group ' + (isExpanded ? 'is-expanded' : '')}>
                <button type="button" className="itinerary-film-journey-head" onClick={() => toggleJourney(group.trip.id)} aria-expanded={isExpanded} title={group.trip.name || fallbackName}>
                  <span className="itinerary-film-journey-chevron">{isExpanded ? '⌄' : '›'}</span>
                  <span className="itinerary-film-journey-summary">
                    <strong>{group.trip.name || fallbackName}</strong>
                    <small>{formatTripRange(group.startDate, group.endDate)} · {dayCount}天 · {tripPhotosInGroup.length}张照片</small>
                    <em>{destinations}</em>
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div className="itinerary-film-journey-days" initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }} transition={{ duration: reduceMotion ? 0.01 : 0.24, ease: [0.22, 1, 0.36, 1] }}>
                      {group.days.map((entry, index) => {
                        const dayPhotoCount = dayPhotoCounts.get(entry.day.id) || 0;
                        return (
                          <div key={entry.day.id} className="itinerary-film-day-row">
                            <button type="button" className={'itinerary-film-day ' + (entry.day.id === activeDay?.id ? 'is-active' : '')} onClick={() => handleDaySelect(entry.day.id)}>
                              {entry.day.id === activeDay?.id && <motion.span layoutId="itinerary-active-day-marker" className="itinerary-film-active-day-marker" aria-hidden="true" />}
                              <span className="itinerary-film-day-index">DAY {String(index + 1).padStart(2, '0')}</span>
                              <strong>{formatCompactDate(entry.day.date)} <em>{formatWeekday(entry.day.date)}</em></strong>
                              <small>{dayPhotoCount ? dayPhotoCount + ' 张照片' : '待记录'}</small>
                              {dayPhotoCount > 0 && <i aria-label="已有照片" />}
                            </button>
                            <button type="button" className="itinerary-film-day-delete" onClick={(event) => { event.stopPropagation(); setDeleteRequest({ kind: 'day', tripId: entry.trip.id, dayId: entry.day.id, title: '删除旅行日期', description: `确认删除 ${formatDate(entry.day.date)} 这一天？此操作无法撤销。`, returnFocusTarget: event.currentTarget }); }} aria-label="删除这一天" title="删除这一天"><ActionIcon name="trash" size={16} /></button>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            );
          }) : <div className="itinerary-film-empty-side">从一段旅行开始，日期和照片会在这里整理成胶片索引。</div>}
        </div>        <div className="itinerary-film-sidebar-actions">
          {showTripForm ? (
            <div className="itinerary-film-new-trip-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { resetTripForm(); setShowTripForm(false); } }}>
              <form className="itinerary-film-new-trip" onSubmit={(event) => { event.preventDefault(); handleCreateTrip(); }} onMouseDown={(event) => event.stopPropagation()}>
                <header className="itinerary-film-new-trip-head">
                  <div><span className="itinerary-film-kicker">NEW JOURNEY</span><h3>创建新旅程</h3></div>
                  <button type="button" className="itinerary-film-icon-button" onClick={() => { resetTripForm(); setShowTripForm(false); }} aria-label="关闭创建旅程"><ActionIcon name="close" /></button>
                </header>
                <div className="itinerary-film-new-trip-body">
                  <label>旅程名称<input type="text" value={tripName} onChange={(event) => setTripName(event.target.value)} placeholder={location.name + '之旅'} /></label>
                  <label>主要目的地<div className="itinerary-film-destination-readonly">{location.name}</div></label>
                  <DateRangePicker startDate={tripStart} endDate={tripEnd} onChange={handleDateRangeChange} />
                  {dateError && <div className="itinerary-film-date-error" role="alert">{dateError}</div>}
                </div>
                <footer className="itinerary-film-new-trip-actions">
                  <button type="button" onClick={() => { resetTripForm(); setShowTripForm(false); }}>取消</button>
                  <button type="submit" className="is-primary" disabled={!tripStart || !tripEnd || tripEnd < tripStart}>确定</button>
                </footer>
              </form>
            </div>
          ) : <button type="button" className="itinerary-film-secondary-button" onClick={() => { resetTripForm(); setShowTripForm(true); }}>+ 添加旅程</button>}
          {activeTrip && <button type="button" className="itinerary-film-delete-trip" onClick={(event) => setDeleteRequest({ kind: 'trip', tripId: activeTrip.id, title: '删除整段旅程', description: `确认删除「${activeTrip.name || location.name + '之旅'}」？此操作无法撤销。`, returnFocusTarget: event.currentTarget })}>删除当前旅程</button>}
        </div>      </aside>

      <main className={"itinerary-film-workspace " + (lightTableMode ? "is-light-table" : "") + (isEmptyTrip ? " is-empty-trip" : "")} onLoadCapture={import.meta.env.DEV ? handleFilmImageLoad : undefined}>
        <input ref={uploadRef} type="file" accept="image/*" multiple hidden onChange={handleUpload} disabled={!isUploadReady || Boolean(uploadStatus?.uploading)} />
        {!isEmptyTrip && <header className="itinerary-film-toolbar">
          <div className="itinerary-film-heading">
            <span className="itinerary-film-kicker">{location.name} · {activeDay ? formatDate(activeDay.date) : 'TRAVEL LOG'}</span>
            <h1>{activeDay ? location.name + ' 的胶片卷' : '等待下一段旅程'}</h1>
          </div>
          <div className="itinerary-film-tools">
            <AnimatePresence initial={false} mode="wait">
              {saveStatusLabel && (
                <motion.div
                  key={`${saveState.status}-${saveState.syncStatus}`}
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduceMotion ? 0 : -3 }}
                  transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' }}
                  role="status"
                  aria-live="polite"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    minHeight: 32,
                    padding: '0 8px',
                    border: `1px solid ${saveState.status === 'error' ? 'rgba(190, 120, 102, 0.42)' : 'var(--film-line)'}`,
                    borderRadius: 2,
                    color: saveState.status === 'error' ? 'var(--color-error)' : saveState.status === 'saved' ? 'var(--color-success)' : 'var(--film-muted)',
                    fontSize: 12,
                    lineHeight: 1.35,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>
                    {saveStatusLabel}
                  </span>
                  {savePresentation?.retryLabel && (
                    <button type="button" className="itinerary-film-tool-button" onClick={() => { void flushStorage(); }}>
                      {savePresentation.retryLabel}
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <label className="itinerary-film-format-control">画幅<select value={formatKey} onChange={(event) => handleFormatChange(event.target.value)}>{Object.entries(FORMAT_OPTIONS).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}</select></label>
            <div className="itinerary-film-mode-switch" role="group" aria-label="照片交互模式">
              <span>浏览</span>
              <button type="button" className={'itinerary-film-mode-button ' + (photoInteractionMode === 'pointer' ? 'is-active' : '')} onClick={() => handleInteractionModeChange('pointer')} aria-pressed={photoInteractionMode === 'pointer'}>指针</button>
              <button type="button" className={'itinerary-film-mode-button ' + (photoInteractionMode === 'magnifier' ? 'is-active' : '')} onClick={() => handleInteractionModeChange('magnifier')} aria-pressed={photoInteractionMode === 'magnifier'}>放大镜</button>
            </div>

            <button
              type="button"
              className={'itinerary-film-tool-button itinerary-film-light-table-toggle ' + (lightTableMode ? 'is-active' : '')}
              onClick={() => setLightTableMode((value) => !value)}
              aria-pressed={lightTableMode}
              title={lightTableMode ? '关闭观片灯' : '打开观片灯'}
            >
              <span className="itinerary-film-light-table-copy"><span>观片灯</span><small>LIGHT TABLE</small></span>
            </button>
            <button type="button" className="itinerary-film-tool-button" onClick={() => setExportOpen(true)}>导出</button>
            <button type="button" className="itinerary-film-tool-button itinerary-film-journal-toggle" onClick={() => setIsJournalOpen((value) => !value)} aria-expanded={isJournalOpen}>记录</button>
            <button type="button" className="itinerary-film-icon-button itinerary-film-upload-button" onClick={() => uploadRef.current?.click()} aria-label="上传当天照片" title={isUploadReady ? '上传当天照片' : '请先选择或创建 Day'} disabled={!isUploadReady || Boolean(uploadStatus?.uploading)}><ActionIcon name="upload" /><span className="itinerary-film-upload-label" aria-hidden="true">上传照片</span></button>
          </div>
        </header>}

        {!isEmptyTrip && <div className="itinerary-film-meta-line" style={{ flexWrap: 'wrap', rowGap: 4 }}>
          <span>{activeDay ? 'DAY ' + String(activeDayNumber).padStart(2, '0') + ' / ' + String(days.length).padStart(2, '0') : 'DAY --'}</span>
          <div aria-label="照片归档范围" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, letterSpacing: 0 }}>
            <button type="button" className={'itinerary-film-mode-button ' + (photoScope === 'day' ? 'is-active' : '')} style={{ minHeight: 22, padding: '0 5px', fontSize: 9, whiteSpace: 'nowrap' }} onClick={() => { setPhotoScope('day'); setRollIndex(0); }} aria-pressed={photoScope === 'day'}>当日 {activeDayPhotos.length}</button>
            <button type="button" className={'itinerary-film-mode-button ' + (photoScope === 'unfiled' ? 'is-active' : '')} style={{ minHeight: 22, padding: '0 5px', fontSize: 9, whiteSpace: 'nowrap' }} onClick={() => { setPhotoScope('unfiled'); setRollIndex(0); }} aria-pressed={photoScope === 'unfiled'}>未整理照片 {unfiledPhotos.length}</button>
          </div>
          <span>{activeDay ? photos.length + ' FRAMES · TRIP ' + tripPhotos.length : 'NO FRAMES'}</span>
          <span>{activeDay ? rollRangeText + ' / ' + String(Math.max(rolls.length, 1)).padStart(2, '0') + ' ROLLS' : 'ROLL --'}</span>
        </div>}

        {isEmptyTrip ? (
          <section className="itinerary-film-empty-trip" aria-labelledby="itinerary-film-empty-trip-title">
            <span className="itinerary-film-empty-trip__eyebrow">FIRST FRAME · {location.name}</span>
            <p className="itinerary-film-empty-trip__date">{formatTripRange(activeTrip.startDate, activeTrip.endDate)}</p>
            <h1 id="itinerary-film-empty-trip-title">{activeTrip.name || `${location.name}之旅`}</h1>
            <span className="itinerary-film-empty-trip__rule" aria-hidden="true" />
            <h2>开始保存这段旅程的第一张照片</h2>
            <p className="itinerary-film-empty-trip__note">从一帧开始，慢慢把这段旅程收进档案。</p>
            <div className="itinerary-film-empty-trip__actions">
              <button type="button" className="itinerary-film-empty-trip__upload" onClick={() => uploadRef.current?.click()} disabled={!isUploadReady || Boolean(uploadStatus?.uploading)}>
                {uploadStatus?.uploading ? '正在处理照片…' : '上传第一张照片'}
              </button>
              <button type="button" className="itinerary-film-empty-trip__edit" onClick={() => { setIsJournalOpen(true); setIsEditingRecord(true); setIsReflectionOpen(true); }}>
                整理旅程信息
              </button>
            </div>
            {saveStatusLabel && (
              <div className={'itinerary-film-empty-trip__save-state is-' + saveState.status} role="status" aria-live="polite">
                <span>{saveStatusLabel}</span>
                {savePresentation?.retryLabel && <button type="button" onClick={() => { void flushStorage(); }}>{savePresentation.retryLabel}</button>}
              </div>
            )}
          </section>
        ) : !journeyGroups.length ? (
          <div className="itinerary-film-empty-main"><span className="itinerary-film-empty-mark">+</span><h2>还没有旅行记录</h2><p>创建一段旅程后，就能按日期保存照片与文字。也可以通过顶部“概览”返回城市档案。</p><button type="button" className="itinerary-film-primary-button" onClick={() => { resetTripForm(); setShowTripForm(true); }}>创建旅程</button></div>
        ) : !activeDay ? (
          <div className="itinerary-film-empty-main"><span className="itinerary-film-empty-mark">+</span><h2>这段旅程还没有日期</h2><p>可从左侧选择其他旅程，或创建一段新旅程继续记录。</p><button type="button" className="itinerary-film-primary-button" onClick={() => { resetTripForm(); setShowTripForm(true); }}>添加新旅程</button></div>
        ) : !photos.length ? (
          <div className="itinerary-film-empty-main"><span className="itinerary-film-empty-mark">00</span><h2>{photoScope === 'unfiled' ? '没有未整理照片' : '这一天还没有照片'}</h2><p>{photoScope === 'unfiled' ? '照片会在上传后集中显示在这里，也可以返回当前日期继续浏览。' : unfiledPhotos.length ? `还有 ${unfiledPhotos.length} 张未整理照片，可先查看或稍后归入日期。` : '上传照片后，它们会显示在当前日期的胶片卷中。'}</p>{photoScope === 'unfiled' && <button type="button" className="itinerary-film-secondary-button" onClick={() => { setPhotoScope('day'); setRollIndex(0); }}>返回当前日期</button>}{photoScope === 'day' && unfiledPhotos.length > 0 && <button type="button" className="itinerary-film-secondary-button" onClick={() => { setPhotoScope('unfiled'); setRollIndex(0); }}>查看未整理照片</button>}{photoScope === 'day' && <button type="button" className="itinerary-film-primary-button" onClick={() => uploadRef.current?.click()} disabled={!isUploadReady || Boolean(uploadStatus?.uploading)}>上传照片</button>}</div>
        ) : (
          <>
            <FilmStrip photos={photos} format={format} rollIndex={rollIndex} totalRolls={rolls.length} direction={direction} reduceMotion={reduceMotion} tripId={activeTrip.id} interactionMode={photoInteractionMode} onLockChange={handleMagnifierLockChange} onNext={() => goToRoll(1)} onPrev={() => goToRoll(-1)} onOpen={setSelectedPhoto} onRemove={handleRemovePhoto} onMenu={openFrameMenu} onTransitionComplete={handleRollTransitionComplete} />
            <div className="itinerary-film-roll-controls"><button type="button" onClick={() => goToRoll(-1)} disabled={rollIndex === 0 || isRollAnimating} aria-label="上一卷">←</button><span>PAGE {rollPageText}</span><button type="button" onClick={() => goToRoll(1)} disabled={rollIndex >= maxRollStart || isRollAnimating} aria-label="下一卷">→</button></div>
          </>
        )}

        {!isEmptyTrip && <footer className="itinerary-film-footer"><span>← 翻卷</span><span>{photoInteractionMode === "magnifier" ? (magnifierLocked ? "点击照片解锁 · Esc 返回" : "移动鼠标查看局部 · 点击锁定") : "拖动胶片浏览 · 点击照片打开"}</span><span>{format.shortLabel}</span></footer>}
      </main>

      <aside className={"itinerary-film-journal " + (isJournalOpen ? "is-open" : "")} aria-label="DAILY JOURNAL">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={activeDay?.id || "empty-journal"} className="itinerary-film-journal-content" initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }} transition={{ duration: reduceMotion ? 0.01 : 0.3, ease: [0.22, 1, 0.36, 1] }}>
            <div className="itinerary-film-journal-head">
              <div><span className="itinerary-film-kicker">DAILY JOURNAL</span><strong>{activeDay ? 'DAY ' + String(activeDayNumber).padStart(2, '0') : 'DAY --'}</strong></div>
              <button type="button" className="itinerary-film-edit-button itinerary-film-journal-close" onClick={() => setIsJournalOpen(false)}>收起</button>
              <button type="button" className="itinerary-film-edit-button" onClick={() => { if (isEditingRecord) handleSaveJournal(); else setIsEditingRecord(true); }}>{isEditingRecord ? JOURNAL_COPY.done : JOURNAL_COPY.edit}</button>
            </div>
            <div className="itinerary-film-journal-date">{activeDay ? formatDate(activeDay.date) : 'TBD'}</div>
            <div className="itinerary-film-journal-place">{location.name}{location.routeLabel ? ' / ' + location.routeLabel : ''}{weather && <span className="itinerary-film-journal-weather"> · {weather}</span>}</div>

            <section className="itinerary-film-journal-section itinerary-film-process-section">
              <div className="itinerary-film-section-title"><span>{JOURNAL_COPY.processTitle}</span></div>
              <p className="itinerary-film-section-note">{JOURNAL_COPY.processNote}</p>
              {isEditingRecord ? <textarea className="itinerary-film-process-input" value={journeyDraft} onChange={(event) => updateJournalDraft('journey', event.target.value)} placeholder={JOURNAL_COPY.processPlaceholder} rows={7} /> : <p className="itinerary-film-journal-copy">{journeyText || JOURNAL_COPY.emptyProcess}</p>}
            </section>

            <section className="itinerary-film-journal-section itinerary-film-mood-section">
              <div className="itinerary-film-section-title"><span>{JOURNAL_COPY.moodTitle}</span></div>
              <p className="itinerary-film-section-note">{JOURNAL_COPY.moodNote}</p>
              <div className={'itinerary-film-moods ' + (isEditingRecord ? 'is-editing' : '')}>
                {isEditingRecord ? MOOD_OPTIONS.map((mood) => <button key={mood} type="button" className={moods.includes(mood) ? 'is-selected' : ''} onClick={() => toggleMood(mood)}>{mood}</button>) : moods.length ? moods.map((mood) => <span key={mood}>{mood}</span>) : <span className="itinerary-film-muted">{JOURNAL_COPY.emptyMood}</span>}
              </div>
              {isEditingRecord ? <textarea className="itinerary-film-mood-note" value={moodNoteDraft} onChange={(event) => updateJournalDraft('moodNote', event.target.value)} placeholder={JOURNAL_COPY.moodPlaceholder} rows={2} maxLength={100} /> : moodNote ? <p className="itinerary-film-journal-copy itinerary-film-mood-note-copy">{moodNote}</p> : null}
            </section>

            <section className={'itinerary-film-journal-section itinerary-film-reflection ' + (isReflectionOpen ? 'is-open' : 'is-collapsed')}>
              <button type="button" className="itinerary-film-reflection-toggle" onClick={() => { const next = !isReflectionOpen; setIsReflectionOpen(next); if (next) setIsEditingRecord(true); }} aria-expanded={isReflectionOpen}>
                <span>{isReflectionOpen ? JOURNAL_COPY.reflectionTitle : JOURNAL_COPY.addReflection}</span><span aria-hidden="true">{isReflectionOpen ? '−' : '+'}</span>
              </button>
              {isReflectionOpen && <div className="itinerary-film-reflection-content">
                <p className="itinerary-film-section-note">{JOURNAL_COPY.reflectionNote}</p>
                {isEditingRecord ? <textarea value={reflectionDraft} onChange={(event) => updateJournalDraft('reflection', event.target.value)} placeholder={JOURNAL_COPY.reflectionPlaceholder} rows={6} /> : <p className="itinerary-film-journal-copy">{reflection || JOURNAL_COPY.emptyReflection}</p>}
              </div>}
            </section>

            {companions?.data?.text && <section className="itinerary-film-journal-section"><div className="itinerary-film-section-title"><span>WITH</span></div><p className="itinerary-film-journal-copy">{companions.data.text}</p></section>}
            {music?.data?.title && <div className="itinerary-film-music"><span>♪</span><div><small>AUDIO</small><strong>{music.data.title}</strong></div></div>}
            {isEditingRecord && <button type="button" className="itinerary-film-save-button itinerary-film-journal-save" onClick={handleSaveJournal}>{JOURNAL_COPY.save}</button>}
          </motion.div>
        </AnimatePresence>
      </aside>
      <AnimatePresence>
        {selectedPhoto && (
          <motion.div className="itinerary-film-photo-lightbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedPhoto(null)}>
            <button type="button" className="itinerary-film-lightbox-close" onClick={() => setSelectedPhoto(null)} aria-label="关闭照片"><ActionIcon name="close" size={20} /></button>
            <div className="itinerary-film-lightbox-content" onClick={(event) => event.stopPropagation()}><EditedPhotoImage photo={selectedPhoto} format={format} alt={selectedPhoto.label || '旅行照片'} /><div><span>{location.name} / {formatDate(activeDay?.date)}</span><strong>{selectedPhoto.source === 'meal' ? selectedPhoto.label : 'TRAVEL FRAME'}</strong></div></div>
          </motion.div>
        )}
      </AnimatePresence>

      {frameMenu && (
        <FrameActionMenu
          position={frameMenu.position}
          returnFocusTarget={frameMenu.returnFocusTarget}
          onClose={() => setFrameMenu(null)}
          onCrop={() => handleOpenCrop(frameMenu.photo)}
          onRotate={() => handleRotatePhoto(frameMenu.photo)}
          onMove={frameMenu.photo.source !== 'meal' && activeTrip?.days?.some((day) => day.id !== frameMenu.photo.dayId) ? () => openPhotoMoveDialog(frameMenu.photo) : undefined}
          onDelete={() => handleRemovePhoto(frameMenu.photo, frameMenu.returnFocusTarget)}
        />
      )}
      {deleteRequest && (
        <ConfirmDialog
          title={deleteRequest.title}
          description={deleteRequest.description}
          confirmLabel={deleteRequest.kind === 'photo' ? '删除照片' : deleteRequest.kind === 'day' ? '删除日期' : '删除旅程'}
          returnFocusTarget={deleteRequest.returnFocusTarget}
          fallbackFocusSelector=".itinerary-film-frame-menu-button, .itinerary-film-timeline button:not(:disabled), .mp-nav-back"
          onCancel={() => setDeleteRequest(null)}
          onConfirm={confirmPendingDelete}
        />
      )}
      {photoToMove && (
        <div className="itinerary-film-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isMovingPhoto) setPhotoToMove(null); }}>
          <section className="itinerary-film-export-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-move-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="itinerary-film-dialog-head">
              <div><span className="itinerary-film-kicker">PHOTO ARCHIVE</span><h3 id="photo-move-title">整理照片</h3></div>
              <button type="button" className="itinerary-film-icon-button" onClick={() => setPhotoToMove(null)} aria-label="关闭整理窗口" disabled={isMovingPhoto}><ActionIcon name="close" /></button>
            </div>
            <label>目标日期
              <select value={photoMoveTargetDayId} onChange={(event) => { setPhotoMoveTargetDayId(event.target.value); setPhotoMoveFailed(false); }} disabled={isMovingPhoto}>
                {(activeTrip?.days || []).filter((day) => day.id !== photoToMove.dayId).map((day) => (
                  <option key={day.id} value={day.id}>{formatDate(day.date)}</option>
                ))}
              </select>
            </label>
            {isMovingPhoto || saveState.status === 'saving' ? <p className="itinerary-film-export-status" role="status">保存中…</p> : null}
            {saveState.status === 'saved' && !photoMoveFailed && <p className="itinerary-film-export-status" role="status">{saveStatusLabel}</p>}
            {photoMoveFailed && <p className="itinerary-film-date-error" role="alert">保存失败，照片已恢复移动前的位置。请重试。</p>}
            <div className="itinerary-film-new-trip-actions">
              <button type="button" onClick={() => setPhotoToMove(null)} disabled={isMovingPhoto}>取消</button>
              <button type="button" className="is-primary" onClick={handleMovePhoto} disabled={isMovingPhoto || !photoMoveTargetDayId}>
                {isMovingPhoto ? '保存中…' : photoMoveFailed ? '重试移动' : '移动照片'}
              </button>
            </div>
          </section>
        </div>
      )}
      {cropPhoto && <CropDialog photo={cropPhoto} format={format} onCancel={closeCropEditor} onApply={handleApplyCrop} onRestore={handleRestoreOriginal} />}
      {uploadStatus ? (
        <div
          className="itinerary-film-notice"
          role={uploadStatus.status === 'error' ? 'alert' : 'status'}
          aria-live={uploadStatus.status === 'error' ? 'assertive' : 'polite'}
          style={{ pointerEvents: uploadStatus.failures?.length ? 'auto' : 'none', width: 'min(360px, calc(100vw - 28px))', boxSizing: 'border-box' }}
        >
          <div>
            {uploadStatus.uploading ? (
              <>
                <strong>{uploadStatus.status === 'saving' ? '正在保存旅行照片' : '正在处理旅行照片'}</strong>
                <span style={{ display: 'block', marginTop: 4 }}>{uploadStatus.current} / {uploadStatus.total}</span>
              </>
            ) : uploadStatus.status === 'success' ? (
              <strong>已保存 {uploadStatus.successCount} 张 · 失败 0 张</strong>
            ) : (
              <>
                <strong>已保存 {uploadStatus.successCount} 张 · 失败 {uploadStatus.failures.length} 张</strong>
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  {uploadStatus.failures.map((failure, index) => (
                    <div key={`${failure.file.name}-${index}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={failure.file.name}>{failure.file.name}<small style={{ display: 'block' }}>{failure.stage === 'saving' ? '保存未完成' : '图片处理失败'}</small></span>
                      <button
                        type="button"
                        className="itinerary-film-tool-button"
                        disabled={uploadStatus.uploading}
                        onClick={() => retryFailedUpload(failure)}
                      >
                        {failure.stage === 'saving' ? '重试保存' : '重新上传'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : filmNotice ? <div className="itinerary-film-notice" role="status" aria-live="polite">{filmNotice}</div> : null}

      <ExportDialog open={exportOpen} settings={exportSettings} setSettings={setExportSettings} onClose={() => setExportOpen(false)} onExport={handleExport} status={exportStatus} />
    </div>
  );
}
