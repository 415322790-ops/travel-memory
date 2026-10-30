import { useState, useRef, useEffect } from 'react';

const STORAGE_KEY = 'travel-memory-bgmusic';

function loadMusic() {
  try { const d = localStorage.getItem(STORAGE_KEY); return d ? JSON.parse(d) : { title: '', url: '' }; } catch { return { title: '', url: '' }; }
}
function saveMusic(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* localStorage may be unavailable */ } }

export default function BgMusicPlayer() {
  const [music, setMusic] = useState(() => loadMusic());
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(music);
  const audioRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { saveMusic(music); }, [music]);

  const togglePlay = () => {
    if (!audioRef.current || !music.url) return;
    if (playing) { audioRef.current.pause(); } else { audioRef.current.play(); }
    setPlaying(!playing);
  };

  const handleVolume = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const saveEdit = () => {
    setMusic(draft);
    setEditing(false);
    if (audioRef.current) { audioRef.current.pause(); setPlaying(false); }
  };

  const handleFile = (e) => {
    const f = e.target.files[0]; if (!f) return;
    // Only store small files as base64, otherwise warn
    if (f.size > 2 * 1024 * 1024) {
      alert('音乐文件最大 2MB，请使用链接方式或压缩后再上传');
      return;
    }
    const r = new FileReader();
    r.onload = (ev) => {
      const data = { title: f.name.replace(/\.[^.]+$/, ''), url: ev.target.result };
      setDraft(data);
      setMusic(data);
      setEditing(false);
    };
    r.readAsDataURL(f);
  };

  return (
    <div className={`bgmusic ${expanded ? 'expanded' : ''}`}>
      <audio ref={audioRef} src={music.url || null} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />

      {expanded ? (
        <div className="bgmusic-panel">
          <div className="bgmusic-header">
            <span className="bgmusic-title">{music.title || '背景音乐'}</span>
            <button className="bgmusic-close" onClick={() => setExpanded(false)}>×</button>
          </div>

          {editing ? (
            <div className="bgmusic-edit">
              <input className="trip-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="音乐名称" />
              <input className="trip-input" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="音乐链接 (URL)" />
              <div className="bgmusic-actions">
                <button className="btn-save-sm" onClick={saveEdit}>保存</button>
                <button className="btn-cancel-sm" onClick={() => { setEditing(false); setDraft(music); }}>取消</button>
              </div>
              <div className="bgmusic-or">或</div>
              <button className="bgmusic-upload-btn" onClick={() => fileRef.current?.click()}>上传本地音乐 (≤2MB)</button>
              <input ref={fileRef} type="file" accept="audio/*" hidden onChange={handleFile} />
            </div>
          ) : (
            <div className="bgmusic-controls">
              <button className="bgmusic-play" onClick={togglePlay}>{playing ? '⏸' : '▶️'}</button>
              <div className="bgmusic-vol">
                <span>🔊</span>
                <input type="range" min="0" max="1" step="0.05" value={volume} onChange={handleVolume} />
              </div>
              <button className="bgmusic-edit-btn" onClick={() => { setDraft(music); setEditing(true); }}>✎</button>
            </div>
          )}
        </div>
      ) : (
        <button className="bgmusic-toggle" onClick={() => setExpanded(true)} title="背景音乐">
          🎵
        </button>
      )}
    </div>
  );
}

