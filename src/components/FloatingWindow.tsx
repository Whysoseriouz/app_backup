'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

// Only one window at a time: opening a new one closes the previous one.
let activeId: string | null = null;
const listeners = new Set<() => void>();
function setActive(id: string | null) {
  activeId = id;
  listeners.forEach((l) => l());
}
function useActiveId() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => activeId,
    () => null,
  );
}

// Once the user has dragged a window, the next ones open at the same spot.
let lastPos: { x: number; y: number } | null = null;

const MARGIN = 8;
function clamp(pos: { x: number; y: number }, w: number, h: number) {
  return {
    x: Math.min(Math.max(MARGIN, pos.x), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
    y: Math.min(Math.max(MARGIN, pos.y), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
  };
}

/**
 * Small non-modal window: fixed on screen (doesn't follow page scrolling),
 * draggable by any element marked `data-drag-handle`, closes with Esc.
 * Opens next to `anchorRef` unless the user moved a window before.
 */
export function FloatingWindow({
  anchorRef,
  onClose,
  label,
  initialFocus,
  className,
  onKeyDown,
  children,
}: {
  /** Read when positioning (the element may not exist yet at first render). */
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  label: string;
  initialFocus?: React.RefObject<HTMLElement | null>;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const active = useActiveId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Become the active window; close when another one takes over.
  useEffect(() => {
    setActive(id);
    return () => {
      if (activeId === id) setActive(null);
    };
  }, [id]);
  useEffect(() => {
    // Read the store, not the render value: right after mounting, `active`
    // may still name the window that is just being replaced.
    if (activeId !== null && activeId !== id) onCloseRef.current();
  }, [active, id]);

  // Initial position (before paint): last dragged spot, else beside the cell.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (lastPos) {
      setPos(clamp(lastPos, w, h));
      return;
    }
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) {
      setPos(clamp({ x: (window.innerWidth - w) / 2, y: 120 }, w, h));
      return;
    }
    const right = r.right + 12;
    const x = right + w + MARGIN <= window.innerWidth ? right : r.left - w - 12;
    setPos(clamp({ x, y: r.top - 40 }, w, h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep it on screen when the browser window is resized.
  useEffect(() => {
    function onResize() {
      const el = ref.current;
      if (!el) return;
      setPos((p) => (p ? clamp(p, el.offsetWidth, el.offsetHeight) : p));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Focus the main action; a click that opened the window may move focus
  // away again right after, so re-check once.
  useEffect(() => {
    // Only reclaim focus if it got stranded (page body or the opening cell),
    // never if the user deliberately clicked somewhere else.
    const reclaim = () => {
      const a = document.activeElement;
      if (a === document.body || a === null || a === anchorRef.current) {
        initialFocus?.current?.focus();
      }
    };
    initialFocus?.current?.focus();
    const t = setTimeout(reclaim, 0);
    // The click that opened the window moves focus on mousedown, which can
    // come after the window has mounted – check again once the button is up.
    const onUp = () => setTimeout(reclaim, 0);
    document.addEventListener('pointerup', onUp, { capture: true, once: true });
    const stop = setTimeout(
      () => document.removeEventListener('pointerup', onUp, { capture: true }),
      1500,
    );
    return () => {
      clearTimeout(t);
      clearTimeout(stop);
      document.removeEventListener('pointerup', onUp, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc closes, also when focus is somewhere else on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && activeId === id) {
        e.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [id]);

  // Dragging via any [data-drag-handle] inside the window.
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (e.button !== 0 || !t.closest('[data-drag-handle]')) return;
    if (t.closest('button, input, textarea, select, a')) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!drag.current || !el) return;
    setPos(
      clamp(
        { x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy },
        el.offsetWidth,
        el.offsetHeight,
      ),
    );
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    ref.current?.releasePointerCapture(e.pointerId);
    setPos((p) => {
      if (p) lastPos = p;
      return p;
    });
  }, []);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={label}
      data-floating-window=""
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={pos ? { left: pos.x, top: pos.y } : { left: -9999, top: -9999 }}
      className={cn(
        'fixed z-[55] rounded-xl bg-white ring-1 ring-slate-200 shadow-pop focus:outline-none dark:bg-slate-900 dark:ring-slate-700',
        pos ? 'animate-fade-in' : 'invisible',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
