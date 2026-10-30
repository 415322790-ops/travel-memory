import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTravel } from '../context/TravelContext';
import chinaCities from '../data/chinaCities';
import cityBoundaryIndex from '../data/cityBoundaryIndex';
import districtData from '../data/districts.json';

const TRAVEL_METHODS = [
  { value: 'plane', label: '✈️', name: '飞机' },
  { value: 'train', label: '🚄', name: '火车' },
  { value: 'car', label: '🚗', name: '自驾' },
];

const ALL_PLACES = [
  { name: '北京', lat: 39.9042, lng: 116.4074, type: '市' },
  { name: '上海', lat: 31.2304, lng: 121.4737, type: '市' },
  { name: '广州', lat: 23.1291, lng: 113.2644, type: '市' },
  { name: '深圳', lat: 22.5431, lng: 114.0579, type: '市' },
  { name: '成都', lat: 30.5728, lng: 104.0668, type: '市' },
  { name: '重庆', lat: 29.4316, lng: 106.9123, type: '市' },
  { name: '杭州', lat: 30.2741, lng: 120.1551, type: '市' },
  { name: '南京', lat: 32.0603, lng: 118.7969, type: '市' },
  { name: '武汉', lat: 30.5928, lng: 114.3055, type: '市' },
  { name: '西安', lat: 34.3416, lng: 108.9398, type: '市' },
  { name: '长沙', lat: 28.2282, lng: 112.9388, type: '市' },
  { name: '厦门', lat: 24.4798, lng: 118.0894, type: '市' },
  { name: '昆明', lat: 25.0389, lng: 102.7183, type: '市' },
  { name: '大理', lat: 25.5895, lng: 100.2256, type: '市' },
  { name: '丽江', lat: 26.8721, lng: 100.2299, type: '市' },
  { name: '三亚', lat: 18.2528, lng: 109.5120, type: '市' },
  { name: '拉萨', lat: 29.6500, lng: 91.1000, type: '市' },
  { name: '哈尔滨', lat: 45.8038, lng: 126.5350, type: '市' },
  { name: '青岛', lat: 36.0671, lng: 120.3826, type: '市' },
  { name: '桂林', lat: 25.2736, lng: 110.2900, type: '市' },
  { name: '苏州', lat: 31.2990, lng: 120.5853, type: '市' },
  { name: '贵阳', lat: 26.6470, lng: 106.6302, type: '市' },
  { name: '乌鲁木齐', lat: 43.8256, lng: 87.6169, type: '市' },
  { name: '呼伦贝尔', lat: 49.2116, lng: 119.7658, type: '市' },
  { name: '西双版纳', lat: 22.0054, lng: 100.7972, type: '市' },
  { name: '香港', lat: 22.3193, lng: 114.1694, type: '特别行政区' },
  { name: '澳门', lat: 22.1987, lng: 113.5439, type: '特别行政区' },
  { name: '南昌', lat: 28.6820, lng: 115.8579, type: '市' },
  ...chinaCities.map(({ name, lat, lng }) => ({ name, lat, lng, type: '市' })),
  ...cityBoundaryIndex.map(({ cityName, lat, lng }) => ({ name: cityName, lat, lng, type: '市' })),
  ...districtData.map(d => ({ ...d, type: '区' })),
].filter((place, index, places) => places.findIndex((candidate) => candidate.name === place.name) === index);

export default function AddLocationForm({ onClose, onTripCreated, initialLocation = null }) {
  const { locations, createTripForLocation } = useTravel();
  const [step, setStep] = useState(initialLocation ? 2 : 1);
  const [citySearch, setCitySearch] = useState(initialLocation?.name || '');
  const [selectedCity, setSelectedCity] = useState(() => initialLocation ? {
    name: initialLocation.name,
    lat: initialLocation.lat,
    lng: initialLocation.lng,
    existingLocationId: initialLocation.id,
  } : null);
  const [travelFrom, setTravelFrom] = useState('');
  const [travelMethod, setTravelMethod] = useState('plane');
  const [tripName, setTripName] = useState('');
  const [tripStartDate, setTripStartDate] = useState('');
  const [tripEndDate, setTripEndDate] = useState('');
  const [formError, setFormError] = useState('');

  const filteredCities = ALL_PLACES.filter(
    (c) => c.name.includes(citySearch),
  ).slice(0, 15);

  const handleSelectCity = (city) => {
    const existingLocation = locations.find((location) => location.name === city.name);
    setSelectedCity({ ...city, existingLocationId: existingLocation?.id || null });
    setCitySearch(city.name);
    setStep(2);
    setFormError('');
  };

  const handleSubmit = () => {
    if (!selectedCity) return;
    if (!tripStartDate || !tripEndDate || tripEndDate < tripStartDate) {
      setFormError('请选择有效的出发日期和返回日期');
      return;
    }

    const monthLabel = tripStartDate.slice(0, 7).replace('-', '年') + '月';
    const created = createTripForLocation({
      existingLocationId: selectedCity.existingLocationId,
      location: selectedCity.existingLocationId ? null : {
        id: selectedCity.name.toLowerCase().replace(/\s+/g, '-'),
        name: selectedCity.name,
        lat: selectedCity.lat,
        lng: selectedCity.lng,
        travelFrom: travelFrom || null,
        travelMethod: travelFrom ? travelMethod : null,
      },
      startDate: tripStartDate,
      endDate: tripEndDate,
      name: tripName.trim() || (selectedCity.name + '之旅 · ' + monthLabel),
    });
    if (!created) {
      setFormError('创建旅行失败，请重试');
      return;
    }
    onTripCreated?.(created);
  };

  return (
    <motion.div className="form-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="form-dialog" initial={{ scale: 0.92, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 20 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="form-title">记录一次旅行</h2>
        <div className="step-dots">
          <div className={`step-dot ${step === 1 ? 'active' : ''}`} />
          <div className={`step-dot ${step === 2 ? 'active' : ''}`} />
        </div>
        {step === 1 && (
          <div>
          <label className="form-label">选择已有城市或新城市</label>
            <input className="form-input" type="text" placeholder="输入城市或区名..." value={citySearch} onChange={(e) => { setCitySearch(e.target.value); setSelectedCity(null); }} autoFocus />
            {citySearch && (
              <div className="city-dropdown">
                {filteredCities.length > 0 ? (
                  filteredCities.map((city) => (
                    <button key={city.name + city.type} className="city-option" onClick={() => handleSelectCity(city)}>
                      {city.name} <span style={{ fontSize: 10, opacity: 0.5 }}>{city.type}</span>
                    </button>
                  ))
                ) : (
                  <span className="city-empty">未找到匹配的城市</span>
                )}
              </div>
            )}
          </div>
        )}
        {step === 2 && (
          <div>
            <div className="selected-city-badge">
              目的地 <strong>{selectedCity?.name}</strong>
              <span>{selectedCity?.existingLocationId ? '已有城市' : '新城市'}</span>
            </div>
            {!selectedCity?.existingLocationId && <>
              <label className="form-label">出发城市</label>
              <select className="form-input" value={travelFrom} onChange={(e) => setTravelFrom(e.target.value)}>
                <option value="">无（首个目的地）</option>
                {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            </>}
            {!selectedCity?.existingLocationId && travelFrom && (
              <>
                <label className="form-label">出行方式</label>
                <div className="method-options">
                  {TRAVEL_METHODS.map((m) => (
                    <button key={m.value} className={`method-btn ${travelMethod === m.value ? 'active' : ''}`} onClick={() => setTravelMethod(m.value)}>
                      <div style={{ fontSize: 20, marginBottom: 2 }}>{m.label}</div>
                      <div style={{ fontSize: 11 }}>{m.name}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
            <label className="form-label">旅行名称（可选）</label>
            <input
              className="form-input"
              type="text"
              value={tripName}
              onChange={(event) => setTripName(event.target.value)}
              placeholder={selectedCity?.name + '之旅'}
            />
            <label className="form-label">旅行日期</label>
            <div className="form-date-range">
              <input className="form-input" type="date" value={tripStartDate} onChange={(event) => setTripStartDate(event.target.value)} aria-label="出发日期" />
              <input className="form-input" type="date" value={tripEndDate} onChange={(event) => setTripEndDate(event.target.value)} aria-label="返回日期" />
            </div>
            {formError && <div className="itinerary-film-date-error" role="alert">{formError}</div>}
            <div className="form-actions">
              <button className="btn-cancel" type="button" onClick={() => setStep(1)}>返回</button>
              <button className="btn-save" type="button" onClick={handleSubmit}>创建旅行</button>
            </div>
          </div>
        )}
        <button className="form-close" onClick={onClose}>×</button>
      </motion.div>
    </motion.div>
  );
}


