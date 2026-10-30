import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTravel, BLOCK_DEFS } from '../context/TravelContext';
import { formatCalendarDateLabel } from '../utils/calendarDate';
import { usePhotoObjectUrl } from '../storage/usePhotoObjectUrl';

function formatDateLabel(date) {
  return formatCalendarDateLabel(date);
}

const SLOT_DEFAULTS = [
  { key: 'morning', label: '🌅 早上', meal: 'breakfast', mealLabel: '🥐 早餐' },
  { key: 'afternoon', label: '☀️ 下午', meal: 'lunch', mealLabel: '🍜 午餐' },
  { key: 'evening', label: '🌙 晚上', meal: 'dinner', mealLabel: '🍲 晚餐' },
];

let _slotCounter = 0;
function newSlotKey() { return 'slot-' + (++_slotCounter) + '-' + Date.now().toString(36); }

const TRAVEL_ICONS = { plane: '✈️', train: '🚄', car: '🚗', walk: '🚶', bike: '🚲' };
const TRAVEL_LABELS = { plane: '飞机', train: '火车', car: '自驾', walk: '步行', bike: '骑行' };

function compressJournalImage(file, maxWidth = 800, quality = 0.62) {
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
        resolve({
          blob,
          width: canvas.width,
          height: canvas.height,
          aspectRatio: canvas.width / canvas.height,
          fileName: file.name || '',
          fileType: file.type || 'image/jpeg',
          fileSize: file.size || 0,
        });
      }, 'image/jpeg', quality);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片读取失败，请换一张图片'));
    };
    image.src = objectUrl;
  });
}

function EditableLabel({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <input className="trip-input" style={{ width: 100, fontSize: 12, padding: '2px 6px' }}
        value={draft} onChange={(e) => setDraft(e.target.value)}
        autoFocus onBlur={() => { onChange(draft); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { onChange(draft); setEditing(false); } }} />
    );
  }
  return <span className="slot-label" onClick={() => { setDraft(value); setEditing(true); }} style={{ cursor: 'pointer' }}>{value}</span>;
}

function BlockTitle({ title, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  if (editing) {
    return (
      <div className="block-title-edit">
        <input className="trip-input" value={draft} onChange={(e) => setDraft(e.target.value)}
          autoFocus onBlur={() => { onRename(draft); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { onRename(draft); setEditing(false); } }} />
      </div>
    );
  }
  return <h4 className="trip-section-title" onDoubleClick={() => { setDraft(title); setEditing(true); }}>{title} <span style={{ fontSize: 9, opacity: 0.3 }}>✎</span></h4>;
}

function MealPhoto({ url, onSet, onRemove }) {
  const ref = useRef(null);
  const photoSrc = usePhotoObjectUrl(url);
  return (
    <div className="meal-photo">
      {url ? (
        <div className="meal-photo-done"><img src={photoSrc || undefined} alt="" /><button className="meal-photo-remove" onClick={onRemove}>×</button></div>
      ) : (
        <button className="meal-photo-add" onClick={() => ref.current?.click()}>+</button>
      )}
      <input ref={ref} type="file" accept="image/*" hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try { await onSet(await compressJournalImage(f, 600, 0.6)); } catch (error) { console.warn('[TravelMemory] 餐食照片上传失败', error); }
        }} />
    </div>
  );
}

function MiniPlayer({ data, onChange }) {
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState(data);
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  if (editing) {
    return (
      <div className="trip-music-edit">
        <input className="trip-input" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="歌曲名" />
        <input className="trip-input" value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="音乐链接" />
        <div className="trip-inline-actions"><button className="btn-save-sm" onClick={() => { onChange(d); setEditing(false); }}>保存</button><button className="btn-cancel-sm" onClick={() => setEditing(false)}>取消</button></div>
      </div>
    );
  }
  if (!d.title && !d.url) return <div className="trip-empty-hint" onClick={() => setEditing(true)}>+ 添加音乐</div>;
  return (
    <div className="trip-music-row">
      <span className="trip-music-icon">🎵</span><span className="trip-music-title">{d.title || '未知歌曲'}</span>
      {d.url && <><audio ref={audioRef} src={d.url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} /><button className="mini-play-btn" onClick={() => audioRef.current?.[playing ? 'pause' : 'play']()}>{playing ? '⏸' : '▶'}</button></>}
      <button className="trip-edit-btn" onClick={() => { setD(data); setEditing(true); }}>✎</button>
    </div>
  );
}

function PhotoSlider({ photos, locId, dayId, onLightbox }) {
  const { addDayPhoto, removeDayPhoto } = useTravel();
  const [idx, setIdx] = useState(0);
  const photoRef = useRef(null);
  const currentPhoto = photos[idx];
  const currentSrc = usePhotoObjectUrl(currentPhoto);

  if (photos.length === 0) {
    return (
      <button className="trip-photo-add" onClick={() => photoRef.current?.click()}>+ 添加照片</button>
    );
  }

  const handleAdd = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const saved = await addDayPhoto(locId, dayId, { ...(await compressJournalImage(f)), date: '' });
      if (saved === false) throw new Error('照片尚未完成持久化，请稍后重试');
    }
    catch (error) { console.warn('[TravelMemory] 日记照片上传失败', error); }
  };

  return (
    <div className="trip-photo-slider">
      <div className="photo-slider-main">
        <img src={currentSrc || undefined} alt="" onClick={() => onLightbox(currentPhoto)} />
        {photos.length > 1 && (
          <>
            <button className="photo-slider-arrow left" onClick={() => setIdx(idx === 0 ? photos.length - 1 : idx - 1)}>‹</button>
            <button className="photo-slider-arrow right" onClick={() => setIdx(idx === photos.length - 1 ? 0 : idx + 1)}>›</button>
          </>
        )}
        <button className="photo-slider-del" onClick={() => { removeDayPhoto(locId, dayId, idx); if (idx >= photos.length - 1) setIdx(Math.max(0, idx - 1)); }}>×</button>
      </div>
      <div className="photo-slider-bar">
        <div className="photo-thumbs">
          {photos.map((p, i) => (
            <div key={i} className={`photo-thumb ${i === idx ? 'active' : ''}`} onClick={() => setIdx(i)}>
              <PhotoThumb photo={p} />
            </div>
          ))}
          <button className="photo-thumb-add" onClick={() => photoRef.current?.click()}>+</button>
        </div>
        <span className="photo-count">{idx + 1} / {photos.length}</span>
      </div>
      <input ref={photoRef} type="file" accept="image/*" hidden onChange={handleAdd} />
    </div>
  );
}

function PhotoThumb({ photo }) {
  const src = usePhotoObjectUrl(photo);
  return <img src={src || undefined} alt="" />;
}

function JournalLightboxImage({ photo }) {
  const src = usePhotoObjectUrl(photo);
  return <motion.img src={src || undefined} alt="" initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} />;
}

function BlockRenderer({ block, locId, dayId, onRemove, onRenameTitle }) {
  const { updateBlockData, setMealPhoto, updateItinerarySlot, flushStorage } = useTravel();
  const [lightbox, setLightbox] = useState(null);
  const bId = block.id;
  const flushOnBlur = () => window.setTimeout(() => { void flushStorage(); }, 0);

  const content = () => {
    switch (block.type) {
      case 'itinerary': {
        const slots = block.data.slots || SLOT_DEFAULTS.map((s) => ({ key: s.key, text: '', breakfast: null, lunch: null, dinner: null }));
        const slotDefs = block.data.slotDefs || SLOT_DEFAULTS.map((s) => ({ key: s.key, label: s.label, meal: s.meal, mealLabel: s.mealLabel }));

        const addSlot = () => {
          const nk = newSlotKey();
          const newDefs = [...slotDefs, { key: nk, label: '🕐 时间段', meal: nk, mealLabel: '🍽 餐' }];
          const newSlots = [...slots, { key: nk, text: '', [nk]: null }];
          updateBlockData(locId, dayId, bId, { slotDefs: newDefs, slots: newSlots });
        };
        const removeSlot = (si) => {
          const newDefs = slotDefs.filter((_, i) => i !== si);
          const newSlots = slots.filter((_, i) => i !== si);
          updateBlockData(locId, dayId, bId, { slotDefs: newDefs, slots: newSlots });
        };

        return (
          <div>
            {slotDefs.map((sd, si) => {
              const s = slots[si] || { text: '', [sd.meal]: null };
              return (
                <div key={sd.key} className="itinerary-slot">
                  <div className="slot-header">
                    <EditableLabel value={sd.label} onChange={(v) => { const a = [...slotDefs]; a[si] = { ...a[si], label: v }; updateBlockData(locId, dayId, bId, { slotDefs: a }); }} />
                    <MealPhoto url={s[sd.meal]} onSet={(u) => setMealPhoto(locId, dayId, si, sd.meal, u)} onRemove={() => setMealPhoto(locId, dayId, si, sd.meal, null)} />
                    <EditableLabel value={sd.mealLabel} onChange={(v) => { const a = [...slotDefs]; a[si] = { ...a[si], mealLabel: v }; updateBlockData(locId, dayId, bId, { slotDefs: a }); }} />
                    <button className="slot-remove-btn" onClick={() => removeSlot(si)} title="删除此段">×</button>
                  </div>
                  <textarea className="slot-text" value={s.text || ''} onChange={(e) => updateItinerarySlot(locId, dayId, si, e.target.value)} onBlur={flushOnBlur} placeholder="做了什么..." rows={2} />
                </div>
              );
            })}
            <button className="slot-add-btn" onClick={addSlot}>+ 添加时间段</button>
          </div>
        );
      }
      case 'photos': {
        return <PhotoSlider photos={block.data.photos || []} locId={locId} dayId={dayId} onLightbox={setLightbox} />;
      }
      case 'music':
        return <MiniPlayer data={{ title: block.data.title || '', url: block.data.url || '' }} onChange={(d) => updateBlockData(locId, dayId, bId, d)} />;
      case 'feeling':
        return <textarea className="trip-textarea" value={block.data.text || ''} onChange={(e) => updateBlockData(locId, dayId, bId, { text: e.target.value })} onBlur={flushOnBlur} placeholder="记录当时的感受..." rows={3} />;
      case 'companions':
        return <input className="trip-input" value={block.data.text || ''} onChange={(e) => updateBlockData(locId, dayId, bId, { text: e.target.value })} onBlur={flushOnBlur} placeholder="和谁一起..." />;
      case 'text':
        return <textarea className="trip-textarea" value={block.data.text || ''} onChange={(e) => updateBlockData(locId, dayId, bId, { text: e.target.value })} onBlur={flushOnBlur} placeholder="写点什么..." rows={3} />;
      default:
        return <div className="trip-empty-hint">未知板块类型</div>;
    }
  };

  return (
    <div className="trip-block">
      <div className="block-header">
        <BlockTitle title={block.title} onRename={(t) => onRenameTitle(bId, t)} />
        <button className="block-remove" onClick={() => onRemove(bId)} title="删除板块">×</button>
      </div>
      <div className="block-body">{content()}</div>
      <AnimatePresence>
        {lightbox && (
          <motion.div className="lightbox-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLightbox(null)}>
            <button className="lightbox-close" onClick={() => setLightbox(null)}>×</button>
            <JournalLightboxImage photo={lightbox} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AddBlockMenu({ onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="add-block-area">
      {open ? (
        <div className="add-block-menu">
          {Object.entries(BLOCK_DEFS).map(([key, def]) => (
            <button key={key} className="add-block-option" onClick={() => { onAdd(key); setOpen(false); }}>{def.icon} {def.title}</button>
          ))}
          <button className="add-block-option cancel" onClick={() => setOpen(false)}>取消</button>
        </div>
      ) : (
        <button className="add-block-trigger" onClick={() => setOpen(true)}>+ 添加板块</button>
      )}
    </div>
  );
}

function DayCard({ locId, day, expanded, onToggle, onDelete }) {
  const { addBlock, removeBlock, updateBlockTitle } = useTravel();
  const blocks = day.blocks || [];
  return (
    <div className="day-card">
      <div className="day-header" onClick={onToggle}>
        <span className="day-arrow">{expanded ? '▼' : '▶'}</span>
        <span className="day-date">{formatDateLabel(day.date)}</span>
        <button className="day-delete-btn" onClick={(e) => { e.stopPropagation(); if (confirm('删除这一天？')) onDelete(); }}>删除</button>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div className="day-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
            {blocks.map((b) => (
              <BlockRenderer key={b.id} block={b} locId={locId} dayId={day.id}
                onRemove={(bid) => removeBlock(locId, day.id, bid)}
                onRenameTitle={(bid, t) => updateBlockTitle(locId, day.id, bid, t)} />
            ))}
            <AddBlockMenu onAdd={(type) => addBlock(locId, day.id, type)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TripContent({ location }) {
  const { updateLocation, addTrip, addDayToTrip, deleteTrip, deleteDay } = useTravel();
  const [expandedTrip, setExpandedTrip] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [addDayTripId, setAddDayTripId] = useState(null);
  const [newDayDate, setNewDayDate] = useState('');
  const [editingRoute, setEditingRoute] = useState(false);
  const [routeDraft, setRouteDraft] = useState('');

  const trips = location.trips || [];
  const currentMethod = location.travelMethod || 'plane';
  const routeLabel = location.routeLabel || '';

  return (
    <div className="trip-content">
      <div className="trip-add-bar">
        {showNewTrip ? (
          <div className="trip-add-form">
            <input className="trip-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span style={{ color: '#b8a088', fontSize: 12 }}>至</span>
            <input className="trip-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <button className="btn-save-sm" onClick={() => { if (startDate && endDate) { const tid = addTrip(location.id, startDate, endDate); setExpandedTrip(tid); setShowNewTrip(false); setStartDate(''); setEndDate(''); } }}>创建旅程</button>
            <button className="btn-cancel-sm" onClick={() => setShowNewTrip(false)}>取消</button>
          </div>
        ) : (
          <button className="trip-add-day-btn" onClick={() => setShowNewTrip(true)}>+ 添加旅程</button>
        )}
      </div>

      {trips.map((trip) => (
        <div key={trip.id} className="ym-group">
          <div className="ym-header" onClick={() => setExpandedTrip(expandedTrip === trip.id ? null : trip.id)}>
            <span className="ym-arrow">{expandedTrip === trip.id ? '▼' : '▶'}</span>
            <div className="ym-info">
              <span className="ym-label">{formatDateLabel(trip.startDate)} ~ {formatDateLabel(trip.endDate)} · {trip.days.length}天</span>
              <div className="ym-route" onClick={(e) => e.stopPropagation()}>
                <div className="transport-picker">
                  {Object.entries(TRAVEL_ICONS).map(([key, icon]) => (
                    <button key={key} className={`transport-btn ${currentMethod === key ? 'active' : ''}`}
                      onClick={() => updateLocation(location.id, { travelMethod: key })} title={TRAVEL_LABELS[key]}>{icon}</button>
                  ))}
                </div>
                {editingRoute ? (
                  <input className="trip-input" style={{ flex: 1 }} value={routeDraft}
                    onChange={(e) => setRouteDraft(e.target.value)}
                    autoFocus onBlur={() => { updateLocation(location.id, { routeLabel: routeDraft }); setEditingRoute(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { updateLocation(location.id, { routeLabel: routeDraft }); setEditingRoute(false); } }} />
                ) : (
                  <span className="ym-route-text" onClick={() => { setRouteDraft(routeLabel); setEditingRoute(true); }}>
                    {routeLabel || '点击添加路线...'} <span style={{ fontSize: 9, opacity: 0.3 }}>✎</span>
                  </span>
                )}
              </div>
            </div>
            <button className="trip-delete-btn" onClick={(e) => { e.stopPropagation(); if (confirm('删除整个旅程「' + formatDateLabel(trip.startDate) + ' ~ ' + formatDateLabel(trip.endDate) + '」？')) deleteTrip(location.id, trip.id); }}>删除旅程</button>
          </div>
          {expandedTrip === trip.id && (
            <div className="trip-days">
              {trip.days.map((day) => (
                <DayCard key={day.id} locId={location.id} day={day}
                  expanded={expandedDay === day.id}
                  onToggle={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
                  onDelete={() => deleteDay(location.id, trip.id, day.id)} />
              ))}
              {addDayTripId === trip.id ? (
                <div className="trip-add-form" style={{ padding: '8px 20px 8px 44px' }}>
                  <input className="trip-input" type="date" value={newDayDate} onChange={(e) => setNewDayDate(e.target.value)} />
                  <button className="btn-save-sm" onClick={() => { if (newDayDate) { const did = addDayToTrip(location.id, trip.id, newDayDate); if (did) setExpandedDay(did); setAddDayTripId(null); setNewDayDate(''); } }}>添加</button>
                  <button className="btn-cancel-sm" onClick={() => setAddDayTripId(null)}>取消</button>
                </div>
              ) : (
                <button className="trip-add-day-inline" onClick={() => setAddDayTripId(trip.id)}>+ 添加一天</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
