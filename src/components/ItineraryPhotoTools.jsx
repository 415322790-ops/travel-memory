import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getFinalRotation, getRotatedDimensions, normalizeCrop } from '../utils/filmImageEdits';
import { usePhotoObjectUrl } from '../storage/usePhotoObjectUrl';
import ActionIcon from './ActionIcon';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getDefaultCrop(image, frameRatio) {
  const imageWidth = image?.naturalWidth || image?.width || 1;
  const imageHeight = image?.naturalHeight || image?.height || 1;
  const imageRatio = imageWidth / imageHeight;
  const ratio = Number(frameRatio) || 1;
  if (imageRatio >= ratio) {
    const width = clamp(ratio / imageRatio, 0.12, 1);
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = clamp(imageRatio / ratio, 0.12, 1);
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

function getMenuPosition(position, width = 208, height = 214) {
  if (typeof window === 'undefined') return { left: position.x, top: position.y };
  return {
    left: clamp(position.x, 8, Math.max(8, window.innerWidth - width - 8)),
    top: clamp(position.y, 8, Math.max(8, window.innerHeight - height - 8)),
  };
}

export function FrameActionMenu({ position, returnFocusTarget, onClose, onCrop, onRotate, onMove, onDelete }) {
  const menuRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const returnFocusTargetRef = useRef(returnFocusTarget);
  const [menuPosition, setMenuPosition] = useState(() => getMenuPosition(position));

  useLayoutEffect(() => {
    const updatePosition = () => {
      const menu = menuRef.current;
      if (!menu) return;
      const bounds = menu.getBoundingClientRect();
      const next = getMenuPosition(position, bounds.width, bounds.height);
      setMenuPosition((current) => current.left === next.left && current.top === next.top ? current : next);
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [position, onMove]);

  useEffect(() => {
    onCloseRef.current = onClose;
    returnFocusTargetRef.current = returnFocusTarget;
  }, [onClose, returnFocusTarget]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) onCloseRef.current();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    menuRef.current?.querySelector('button:not(:disabled)')?.focus();
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.requestAnimationFrame(() => {
        if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
        const trigger = returnFocusTargetRef.current;
        if (trigger?.isConnected && typeof trigger.focus === 'function') {
          trigger.focus();
          return;
        }
        const fallback = document.querySelector('.itinerary-film-frame-menu-button, .itinerary-film-workspace button:not(:disabled)');
        fallback?.focus();
      });
    };
  }, []);

  return createPortal(
    <div
      ref={menuRef}
      className="itinerary-film-frame-menu"
      role="group"
      aria-label="照片操作"
      style={{ left: menuPosition.left, top: menuPosition.top }}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onCloseRef.current(); }}
    >
      <button type="button" onClick={onCrop}>裁切</button>
      <button type="button" onClick={onRotate}>旋转90°</button>
      {onMove && <button type="button" onClick={onMove}>整理到其他日期</button>}
      <span className="itinerary-film-frame-menu-divider" aria-hidden="true" />
      <button type="button" className="is-danger" onClick={onDelete}>删除</button>
    </div>,
    document.body,
  );
}

export function CropDialog({ photo, format, onCancel, onApply, onRestore }) {
  const dialogRef = useRef(null);
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef(null);
  const initialCropRef = useRef(normalizeCrop(photo.crop));
  const previewSrc = usePhotoObjectUrl(photo);
  const [imageRect, setImageRect] = useState(null);
  const [draftCrop, setDraftCrop] = useState(() => normalizeCrop(photo.crop));
  const [imageReady, setImageReady] = useState(false);
  const [zoomFactor, setZoomFactor] = useState(1);

  useEffect(() => () => {
    const drag = dragRef.current;
    if (!drag) return;
    window.removeEventListener('pointermove', drag.handleMove);
    window.removeEventListener('pointerup', drag.handleUp);
    dragRef.current = null;
  }, []);

  const measureImage = useCallback(() => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image || !image.naturalWidth) return;
    const stageBounds = stage.getBoundingClientRect();
    const imageBounds = image.getBoundingClientRect();
    setImageRect({
      left: imageBounds.left - stageBounds.left,
      top: imageBounds.top - stageBounds.top,
      width: imageBounds.width,
      height: imageBounds.height,
    });
  }, []);

  const previewRotation = getFinalRotation(photo, format.orientation);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const getFocusable = () => Array.from(dialog.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')).filter((element) => !element.disabled);
    getFocusable()[0]?.focus();
    const handleKeyDown = (event) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
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
    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, []);
  useLayoutEffect(() => {
    if (!imageReady) return undefined;
    measureImage();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureImage);
    if (observer && stageRef.current) observer.observe(stageRef.current);
    window.addEventListener('resize', measureImage);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measureImage);
    };
  }, [imageReady, measureImage]);

  const handleImageLoad = () => {
    setImageReady(true);
    setDraftCrop((current) => {
      const image = imageRef.current;
      const rotation = getFinalRotation(photo, format.orientation);
      const visualSize = getRotatedDimensions(image?.naturalWidth, image?.naturalHeight, rotation);
      const next = current || getDefaultCrop(visualSize, format.frameRatio);
      initialCropRef.current = next;
      return next;
    });
  };

  const handleZoomChange = (event) => {
    const nextFactor = Number(event.target.value);
    const current = draftCrop || getDefaultCrop(imageRef.current, format.frameRatio);
    const image = imageRef.current;
    if (!image?.naturalWidth || !image?.naturalHeight) return;
    const visualRatio = imageRect
      ? imageRect.width / imageRect.height
      : getRotatedDimensions(image.naturalWidth, image.naturalHeight, previewRotation).width
        / getRotatedDimensions(image.naturalWidth, image.naturalHeight, previewRotation).height;
    const normalizedAspect = visualRatio / (Number(format.frameRatio) || 1);
    const width = clamp(current.width * (zoomFactor / nextFactor), 0.12, 1);
    const height = Math.min(1, width * normalizedAspect);
    const centerX = current.x + current.width / 2;
    const centerY = current.y + current.height / 2;
    setDraftCrop({
      x: clamp(centerX - width / 2, 0, 1 - width),
      y: clamp(centerY - height / 2, 0, 1 - height),
      width,
      height,
    });
    setZoomFactor(nextFactor);
  };

  const startDrag = (event, kind) => {
    if (!imageRect || !draftCrop) return;
    event.preventDefault();
    event.stopPropagation();
    const startCrop = { ...draftCrop };
    const startX = event.clientX;
    const startY = event.clientY;
    const normalizedAspect = imageRect.width / imageRect.height / (Number(format.frameRatio) || 1);
    dragRef.current = { kind, startCrop, startX, startY, normalizedAspect };

    const handleMove = (moveEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (moveEvent.clientX - drag.startX) / imageRect.width;
      const dy = (moveEvent.clientY - drag.startY) / imageRect.height;
      if (drag.kind === 'move') {
        setDraftCrop({
          ...drag.startCrop,
          x: clamp(drag.startCrop.x + dx, 0, 1 - drag.startCrop.width),
          y: clamp(drag.startCrop.y + dy, 0, 1 - drag.startCrop.height),
        });
        return;
      }

      const right = drag.startCrop.x + drag.startCrop.width;
      const bottom = drag.startCrop.y + drag.startCrop.height;
      const minWidth = 0.12;
      let width;
      let x;
      let y;
      if (drag.kind === 'se') {
        width = clamp(drag.startCrop.width + dx, minWidth, Math.min(1 - drag.startCrop.x, (1 - drag.startCrop.y) / drag.normalizedAspect));
        x = drag.startCrop.x;
        y = drag.startCrop.y;
      } else if (drag.kind === 'sw') {
        width = clamp(drag.startCrop.width - dx, minWidth, Math.min(right, (1 - drag.startCrop.y) / drag.normalizedAspect));
        x = right - width;
        y = drag.startCrop.y;
      } else if (drag.kind === 'ne') {
        width = clamp(drag.startCrop.width + dx, minWidth, Math.min(1 - drag.startCrop.x, bottom / drag.normalizedAspect));
        x = drag.startCrop.x;
        y = bottom - width * drag.normalizedAspect;
      } else {
        width = clamp(drag.startCrop.width - dx, minWidth, Math.min(right, bottom / drag.normalizedAspect));
        x = right - width;
        y = bottom - width * drag.normalizedAspect;
      }
      const height = width * drag.normalizedAspect;
      setDraftCrop({
        x: clamp(x, 0, 1 - width),
        y: clamp(y, 0, 1 - height),
        width,
        height,
      });
    };

    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    dragRef.current.handleMove = handleMove;
    dragRef.current.handleUp = handleUp;

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const resetCrop = () => {
    if (initialCropRef.current) setDraftCrop(initialCropRef.current);
  };

  return createPortal(
    <div className="itinerary-film-modal-backdrop itinerary-film-crop-backdrop" role="presentation" onClick={onCancel}>
      <section ref={dialogRef} className="itinerary-film-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="film-crop-title" onClick={(event) => event.stopPropagation()}>
        <header className="itinerary-film-dialog-head">
          <div><span className="itinerary-film-kicker">DARKROOM EDIT</span><h3 id="film-crop-title">裁切照片</h3></div>
          <button type="button" className="itinerary-film-icon-button" onClick={onCancel} aria-label="关闭裁切窗口"><ActionIcon name="close" /></button>
        </header>
        <div ref={stageRef} className="itinerary-film-crop-stage">
          <img ref={imageRef} src={previewSrc} alt="裁切预览" loading="eager" decoding="async" onLoad={handleImageLoad} style={{ transform: 'rotate(' + previewRotation + 'deg)' }} />
          {imageReady && imageRect && draftCrop && (
            <div
              className="itinerary-film-crop-selection"
              style={{
                left: imageRect.left + draftCrop.x * imageRect.width,
                top: imageRect.top + draftCrop.y * imageRect.height,
                width: draftCrop.width * imageRect.width,
                height: draftCrop.height * imageRect.height,
              }}
              onPointerDown={(event) => startDrag(event, 'move')}
            >
              <div className="itinerary-film-crop-shade" aria-hidden="true" />
              {['nw', 'ne', 'sw', 'se'].map((handle) => <button key={handle} type="button" className={'itinerary-film-crop-handle ' + handle} aria-label="调整裁切范围" onPointerDown={(event) => startDrag(event, handle)} />)}
            </div>
          )}
          {!imageReady && <span className="itinerary-film-crop-loading">正在准备照片…</span>}
        </div>
        <div className="itinerary-film-crop-zoom">
          <label htmlFor="itinerary-film-crop-zoom-input">缩放</label>
          <input id="itinerary-film-crop-zoom-input" type="range" min="1" max="3" step="0.1" value={zoomFactor} onChange={handleZoomChange} />
          <output>{zoomFactor.toFixed(1)}×</output>
        </div>
        <p className="itinerary-film-crop-note">拖动选区调整取景，拖动四角改变范围。缩放会转换为裁切范围，照片会按当前画幅比例输出。</p>
        <footer className="itinerary-film-crop-actions">
          <button type="button" className="itinerary-film-text-button" onClick={onRestore}>恢复原图</button>
          <button type="button" className="itinerary-film-text-button" onClick={resetCrop}>重置</button>
          <span />
          <button type="button" onClick={onCancel}>取消</button>
          <button type="button" className="is-primary" onClick={() => onApply(draftCrop)}>应用裁切</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
