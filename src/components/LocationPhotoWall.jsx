import { useId, useState } from 'react';
import { motion } from 'framer-motion';
import { usePhotoObjectUrl } from '../storage/usePhotoObjectUrl';

const PHOTO_SLOTS = [
  { id: 'top-left', index: 0, className: 'is-top-left', label: '照片 01', defaultOrientation: 'landscape', defaultAspectRatio: 1.5 },
  { id: 'top-right', index: 1, className: 'is-top-right', label: '照片 02', defaultOrientation: 'landscape', defaultAspectRatio: 1.45 },
  { id: 'mid-left', index: 2, className: 'is-mid-left', label: '照片 03', defaultOrientation: 'portrait', defaultAspectRatio: 0.78 },
  { id: 'mid-right', index: 3, className: 'is-mid-right', label: '照片 04', defaultOrientation: 'portrait', defaultAspectRatio: 0.82 },
  { id: 'bottom-left', index: 4, className: 'is-bottom-left', label: '照片 05', defaultOrientation: 'landscape', defaultAspectRatio: 1.45 },
  { id: 'bottom-right', index: 5, className: 'is-bottom-right', label: '照片 06', defaultOrientation: 'landscape', defaultAspectRatio: 1.35 },
];

function PhotoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m3 16 4.5-4.5 3.5 3 2.5-2.5L21 17" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function getOrientation(aspectRatio) {
  if (aspectRatio > 1.2) return 'landscape';
  if (aspectRatio < 0.83) return 'portrait';
  return 'square';
}

function PhotoSlot({ locationId, slot, src, meta, onOpen, onUpload, onRemove, onImageLoad, isUploading }) {
  const baseId = useId().replace(/:/g, '');
  const inputId = baseId + '-' + locationId + '-' + slot.id;
  const resolvedSrc = usePhotoObjectUrl(src);
  const hasPhoto = Boolean(src);
  const orientation = meta?.orientation || slot.defaultOrientation || 'square';
  const aspectRatio = meta?.aspectRatio || slot.defaultAspectRatio || 1.2;
  const className = 'location-photo-slot ' + slot.className + ' is-' + orientation + ' ' + (hasPhoto ? 'has-image' : 'is-empty');

  return (
    <motion.div
      className={className}
      style={{ '--photo-ratio': aspectRatio }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: slot.index * 0.06, duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="location-photo-frame">
        {hasPhoto ? (
          <button type="button" className="location-photo-open" onClick={() => onOpen(slot.index)} aria-label={'查看第 ' + (slot.index + 1) + ' 张照片'}>
            {resolvedSrc ? <img src={resolvedSrc} alt="" loading={slot.index === 0 ? 'eager' : 'lazy'} onLoad={(event) => onImageLoad(slot.index, event.currentTarget)} /> : <span className="location-photo-placeholder-loading">正在读取照片</span>}
          </button>
        ) : (
          <label className="location-photo-placeholder" htmlFor={inputId}>
            <span className="location-photo-placeholder-icon"><PhotoIcon /></span>
            <span>{isUploading ? '正在保存' : '添加照片'}</span>
            <small>{slot.label}</small>
          </label>
        )}

        {hasPhoto && (
          <>
            <button
              type="button"
              className="location-photo-remove"
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRemove(slot.index); }}
              title="从概览移除"
              aria-label="从概览移除"
            >
              ×
            </button>
            <div className="location-photo-actions" aria-label={slot.label + '操作'}>
              <label className="location-photo-action" htmlFor={inputId} title="替换照片">
                <UploadIcon />
                <span>替换</span>
              </label>
            </div>
          </>
        )}
        <input
          id={inputId}
          className="location-photo-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onUpload(slot.index, file);
          }}
        />
      </div>
    </motion.div>
  );
}

export default function LocationPhotoWall({
  locationId,
  locationName,
  locationDescription,
  travelLabel,
  images,
  imageMeta,
  onOpen,
  onUpload,
  onRemove,
}) {
  const [error, setError] = useState('');
  const [uploadingSlot, setUploadingSlot] = useState(null);
  const [photoMeta, setPhotoMeta] = useState({});
  const imageList = Array.isArray(images) ? images : [];

  const extraSlots = imageList.slice(PHOTO_SLOTS.length).map((src, offset) => ({
    id: 'extra-' + offset,
    index: PHOTO_SLOTS.length + offset,
    className: 'is-extra',
    label: '照片 ' + String(PHOTO_SLOTS.length + offset + 1).padStart(2, '0'),
    defaultOrientation: 'square',
    defaultAspectRatio: 1.2,
    src,
  }));

  const handleImageLoad = (index, image) => {
    const naturalWidth = image?.naturalWidth || 0;
    const naturalHeight = image?.naturalHeight || 0;
    if (!naturalWidth || !naturalHeight) return;

    const rawAspectRatio = naturalWidth / naturalHeight;
    const aspectRatio = Math.max(0.65, Math.min(2.2, rawAspectRatio));
    const orientation = getOrientation(rawAspectRatio);

    setPhotoMeta((previous) => {
      const current = previous[index];
      if (
        current &&
        current.orientation === orientation &&
        Math.abs(current.aspectRatio - aspectRatio) < 0.01
      ) {
        return previous;
      }
      return { ...previous, [index]: { orientation, aspectRatio } };
    });
  };

  const handleUpload = async (index, file) => {
    if (!file.type.startsWith('image/')) {
      setError('请选择 JPG、PNG 或 WebP 图片');
      return;
    }
    setError('');
    setUploadingSlot(index);
    try {
      await onUpload(index, file);
    } catch (uploadError) {
      setError(uploadError.message || '照片保存失败，请重试');
    } finally {
      setUploadingSlot(null);
    }
  };

  return (
    <section className="location-photo-wall" aria-labelledby="location-cover-title">
      <div className="location-photo-wall-grain" />
      <div className="location-photo-wall-mark" aria-hidden="true">TRAVEL MEMORY / ARCHIVE</div>
      <div className="location-cover-copy">
        <span className="location-cover-kicker">A PLACE TO REMEMBER · {travelLabel || 'PERSONAL ARCHIVE'}</span>
        <h1 id="location-cover-title">{locationName}</h1>
        {locationDescription && <p>{locationDescription}</p>}
      </div>

      <div className="location-photo-stage">
        {imageList.length === 0 && (
          <div className="location-photo-wall-empty">
            <PhotoIcon />
            <span>从右上角添加照片</span>
          </div>
        )}
        {PHOTO_SLOTS.filter((slot) => slot.index < imageList.length).map((slot) => (
          <PhotoSlot
            key={slot.id}
            locationId={locationId}
            slot={slot}
            src={imageList[slot.index] || null}
            meta={photoMeta[slot.index] || imageMeta?.[slot.index]}
            onOpen={onOpen}
            onUpload={handleUpload}
            onRemove={onRemove}
            onImageLoad={handleImageLoad}
            isUploading={uploadingSlot === slot.index}
          />
        ))}
      </div>

      {extraSlots.length > 0 && (
        <div className="location-photo-extra-grid" aria-label="更多地点照片">
          {extraSlots.map((slot) => (
            <PhotoSlot
              key={slot.id}
              locationId={locationId}
              slot={slot}
              src={slot.src || null}
              meta={photoMeta[slot.index] || imageMeta?.[slot.index]}
              onOpen={onOpen}
              onUpload={handleUpload}
              onRemove={onRemove}
              onImageLoad={handleImageLoad}
              isUploading={uploadingSlot === slot.index}
            />
          ))}
        </div>
      )}

      {error && <p className="location-photo-error" role="alert">{error}</p>}
    </section>
  );
}
