import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTravel } from '../context/TravelContext';
import {
  formatTripDateRange,
  formatTripDate,
  getDefaultTrip,
  getTripPhotoCount,
  getTripPhotos,
  sortTripsByLatestStart,
} from '../utils/tripSelection';
import { usePhotoObjectUrl } from '../storage/usePhotoObjectUrl';

function getRepresentativePhoto(location, trips) {
  const overviewPhoto = (location?.landscapeImages || []).find(Boolean);
  if (overviewPhoto) return overviewPhoto;
  return trips.flatMap(getTripPhotos)[0] || '';
}

function CityPanelPhoto({ photo, alt }) {
  const src = usePhotoObjectUrl(photo);
  return src ? <img src={src} alt={alt} /> : null;
}

export default function GlobeCityPanel({ locationId, cityId = locationId }) {
  const { locations } = useTravel();
  const requestedId = String(cityId ?? '').trim();
  const location = locations.find((item) => (
    String(item.id ?? '').trim() === requestedId
    || String(item.cityId ?? '').trim() === requestedId
  ));
  const trips = useMemo(() => sortTripsByLatestStart(location), [location]);
  const activeTrip = useMemo(() => getDefaultTrip(location), [location]);
  const totalPhotoCount = useMemo(() => trips.reduce((count, trip) => count + getTripPhotoCount(trip), 0), [trips]);
  const coverPhoto = getTripPhotos(activeTrip)[0] || getRepresentativePhoto(location, trips);

  if (!location) return null;

  return (
    <motion.aside
      className="globe-city-panel"
      role="status"
      aria-live="polite"
      aria-label={location.name + '旅行档案预览'}
      style={{ pointerEvents: 'none' }}
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 32 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="globe-city-panel__header">
        <div>
          <span className="globe-city-panel__eyebrow">CITY ARCHIVE / TRAVEL MEMORY</span>
          <div className="globe-city-panel__title-row">
            <h2>{location.name}</h2>
            <span>{trips.length} 次旅行</span>
          </div>
        </div>
        <span className="globe-city-panel__signal" aria-hidden="true" />
      </header>

      <div className="globe-city-panel__body">
        <div className="globe-city-panel__cover">
          {coverPhoto ? (
            <figure>
              <CityPanelPhoto photo={coverPhoto} alt={location.name + '旅行封面'} />
              <figcaption>{activeTrip ? formatTripDate(activeTrip.startDate) : 'PERSONAL ARCHIVE'}</figcaption>
            </figure>
          ) : (
            <div className="globe-city-panel__empty-cover">尚未上传城市照片</div>
          )}
        </div>

        <div className="globe-city-panel__caption">
          <span>{location.name} / PERSONAL ARCHIVE</span>
          <strong>{activeTrip?.name || '还没有整理的旅程'}</strong>
        </div>

        <div className="globe-city-panel__meta">
          <span>{activeTrip ? formatTripDateRange(activeTrip) : '待定日期'}</span>
          <span>{totalPhotoCount} 张照片</span>
        </div>

        {trips.length > 1 && (
          <p className="globe-city-panel__archive-note">另有 {trips.length - 1} 段旅行记录</p>
        )}
        <p className="globe-city-panel__hint">点击城市标记进入概览</p>
      </div>
    </motion.aside>
  );
}
