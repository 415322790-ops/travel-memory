import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const MOBILE_QUERY = '(max-width: 760px)';

function getMobileMatch() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function MiniTicketRail({
  tickets,
  currentIndex,
  onSelect,
  reducedMotion,
  getLabel,
  getDateLabel,
  restoredOffset = 0,
  onPositionChange,
}) {
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef(0);
  const [isMobile, setIsMobile] = useState(getMobileMatch);
  const [offset, setOffset] = useState(0);
  const [metrics, setMetrics] = useState({ maxOffset: 0, step: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const restoredPositionAppliedRef = useRef(false);
  const restoredOffsetRef = useRef(restoredOffset);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const handleChange = (event) => setIsMobile(event.matches);
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => () => {
    if (suppressClickTimerRef.current) window.clearTimeout(suppressClickTimerRef.current);
  }, []);

  const measureRail = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return null;

    const firstItem = track.querySelector('[data-ticket-index]');
    const computedTrackStyle = window.getComputedStyle(track);
    const gap = Number.parseFloat(computedTrackStyle.columnGap || computedTrackStyle.gap) || 0;
    const maxOffset = Math.max(0, track.scrollWidth - viewport.clientWidth);
    const step = firstItem ? firstItem.getBoundingClientRect().width + gap : 0;
    setMetrics({ maxOffset, step });
    return { viewport, track, maxOffset };
  }, []);

  const alignActiveTicket = useCallback((behavior = 'smooth') => {
    const measured = measureRail();
    if (!measured) return;
    const { viewport, track, maxOffset } = measured;
    const activeItem = track.querySelector(`[data-ticket-index="${currentIndex}"]`);
    if (!activeItem) return;

    const targetOffset = activeItem.offsetLeft + (activeItem.offsetWidth / 2) - (viewport.clientWidth / 2);
    if (isMobile) {
      viewport.scrollTo({
        left: clamp(targetOffset, 0, maxOffset),
        behavior,
      });
      return;
    }

    setOffset(-clamp(targetOffset, 0, maxOffset));
  }, [currentIndex, isMobile, measureRail]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!restoredPositionAppliedRef.current) {
        const measured = measureRail();
        if (measured) {
          const targetOffset = clamp(Number(restoredOffsetRef.current) || 0, 0, measured.maxOffset);
          if (isMobile) measured.viewport.scrollTo({ left: targetOffset, behavior: 'auto' });
          else setOffset(-targetOffset);
          restoredPositionAppliedRef.current = true;
          return;
        }
      }
      alignActiveTicket(reducedMotion ? 'auto' : 'smooth');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [alignActiveTicket, isMobile, measureRail, reducedMotion, tickets.length]);

  useEffect(() => {
    if (isMobile) return;
    onPositionChange?.(Math.max(0, -offset));
  }, [isMobile, offset, onPositionChange]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const handleResize = () => alignActiveTicket('auto');
    const handleScroll = () => onPositionChange?.(viewport.scrollLeft);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(viewport);
    if (trackRef.current) resizeObserver?.observe(trackRef.current);
    window.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [alignActiveTicket, isMobile, onPositionChange]);

  const handlePointerDown = useCallback((event) => {
    if (isMobile || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset: offset,
      moved: false,
    };
    setIsDragging(true);
  }, [isMobile, offset]);

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 6) drag.moved = true;
    if (!drag.moved) return;
    event.preventDefault();
    viewportRef.current?.setPointerCapture?.(event.pointerId);
    setOffset(clamp(drag.startOffset + distance, -metrics.maxOffset, 0));
  }, [metrics.maxOffset]);

  const finishPointerDrag = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    viewportRef.current?.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setIsDragging(false);
    if (drag.moved) {
      suppressClickRef.current = true;
      if (suppressClickTimerRef.current) window.clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = window.setTimeout(() => {
        suppressClickTimerRef.current = 0;
        suppressClickRef.current = false;
      }, 0);
    }
  }, []);

  const browseRail = useCallback((direction) => {
    if (isMobile || !metrics.maxOffset || !metrics.step) return;
    const step = metrics.step * 2;
    setOffset((value) => clamp(value - (direction * step), -metrics.maxOffset, 0));
  }, [isMobile, metrics.maxOffset, metrics.step]);

  const handleTicketClick = useCallback((index) => {
    if (suppressClickRef.current) return;
    onSelect(index);
  }, [onSelect]);

  const hasOverflow = metrics.maxOffset > 1;
  const hasLeftOverflow = offset < -1;
  const hasRightOverflow = offset > (-metrics.maxOffset + 1);
  const railClassName = [
    'ticket-index-rail',
    hasOverflow ? 'has-overflow' : 'is-compact',
    hasLeftOverflow ? 'has-left-overflow' : '',
    hasRightOverflow ? 'has-right-overflow' : '',
    isDragging ? 'is-dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <nav className={railClassName} aria-label="旅行票根索引">
      <button
        type="button"
        className="ticket-index-arrow ticket-index-arrow--previous"
        aria-label="浏览更早的旅行票根"
        onClick={() => browseRail(-1)}
        disabled={!hasLeftOverflow}
      >
        ‹
      </button>
      <div
        className="ticket-index-viewport"
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        onTouchStart={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
      >
        <div
          className="ticket-index-track"
          ref={trackRef}
          style={{ '--ticket-index-offset': isMobile ? '0px' : `${offset}px` }}
        >
          {tickets.map((ticket, index) => (
            <button
              key={ticket.id}
              type="button"
              className={`ticket-index-item${index === currentIndex ? ' is-active' : ''}`}
              data-ticket-index={index}
              style={{ '--ticket-index-accent': ticket.trip.ticketStubColor || '#668b9b' }}
              onClick={() => handleTicketClick(index)}
              aria-current={index === currentIndex ? 'page' : undefined}
              aria-label={`切换到${ticket.location.name}旅行票根`}
            >
              <span className="ticket-index-item__number">{String(index + 1).padStart(2, '0')}</span>
              <strong>{getLabel(ticket)}</strong>
              <span>{getDateLabel(ticket.trip.startDate)}</span>
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="ticket-index-arrow ticket-index-arrow--next"
        aria-label="浏览更晚的旅行票根"
        onClick={() => browseRail(1)}
        disabled={!hasRightOverflow}
      >
        ›
      </button>
    </nav>
  );
}
