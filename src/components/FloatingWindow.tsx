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

type Pos = { x: number; y: number };
type Size = { w: number; h: number };
interface Layout {
  pos?: Pos;
  size?: Size;
}

// Where/how big the user left a window, per storageKey. Kept in memory and in
// localStorage so it survives reloads (a per-browser convenience only).
const layouts = new Map<string, Layout>();
function loadLayout(key: string): Layout {
  if (!layouts.has(key)) {
    let stored: Layout = {};
    try {
      const raw = localStorage.getItem(`backup-check:window:${key}`);
      if (raw) stored = JSON.parse(raw) as Layout;
    } catch {
      /* storage unavailable */
    }
    layouts.set(key, stored);
  }
  return layouts.get(key)!;
}
function saveLayout(key: string, patch: Layout) {
  const next = { ...loadLayout(key), ...patch };
  if (patch.size === undefined && 'size' in patch) delete next.size;
  layouts.set(key, next);
  try {
    localStorage.setItem(`backup-check:window:${key}`, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

const MARGIN = 8;
function clampPos(pos: Pos, w: number, h: number): Pos {
  return {
    x: Math.min(Math.max(MARGIN, pos.x), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
    y: Math.min(Math.max(MARGIN, pos.y), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
  };
}

type Gesture =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'resize'; x: number; y: number; w: number; h: number };

/**
 * Small non-modal window: fixed on screen (doesn't follow page scrolling),
 * draggable by any element marked `data-drag-handle`, resizable at the
 * bottom-right corner (double-click there resets the size), closes with Esc.
 * Opens next to `anchorRef` unless the user placed a window before.
 */
export function FloatingWindow({
  anchorRef,
  onClose,
  label,
  initialFocus,
  storageKey = 'default',
  minWidth = 320,
  minHeight = 280,
  className,
  onKeyDown,
  children,
}: {
  /** Read when positioning (the element may not exist yet at first render). */
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  label: string;
  initialFocus?: React.RefObject<HTMLElement | null>;
  /** Windows with the same key share their remembered position and size. */
  storageKey?: string;
  minWidth?: number;
  minHeight?: number;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [size, setSize] = useState<Size | null>(
    () => loadLayout(storageKey).size ?? null,
  );
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

  // Initial position (before paint): remembered spot, else beside the cell.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const saved = loadLayout(storageKey).pos;
    if (saved) {
      setPos(clampPos(saved, w, h));
      return;
    }
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) {
      setPos(clampPos({ x: (window.innerWidth - w) / 2, y: 120 }, w, h));
      return;
    }
    const right = r.right + 12;
    const x = right + w + MARGIN <= window.innerWidth ? right : r.left - w - 12;
    setPos(clampPos({ x, y: r.top - 40 }, w, h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep it on screen when the browser window is resized.
  useEffect(() => {
    function onResize() {
      const el = ref.current;
      if (!el) return;
      setSize((s) =>
        s
          ? {
              w: Math.min(s.w, window.innerWidth - 2 * MARGIN),
              h: Math.min(s.h, window.innerHeight - 2 * MARGIN),
            }
          : s,
      );
      setPos((p) => (p ? clampPos(p, el.offsetWidth, el.offsetHeight) : p));
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

  // Move (title bar) and resize (corner) share one pointer gesture.
  const gesture = useRef<Gesture | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const el = ref.current;
    if (e.button !== 0 || !el) return;
    const r = el.getBoundingClientRect();
    if (t.closest('[data-resize-handle]')) {
      gesture.current = {
        kind: 'resize',
        x: e.clientX,
        y: e.clientY,
        w: r.width,
        h: r.height,
      };
    } else if (
      t.closest('[data-drag-handle]') &&
      !t.closest('button, input, textarea, select, a')
    ) {
      gesture.current = { kind: 'move', dx: e.clientX - r.left, dy: e.clientY - r.top };
    } else {
      return;
    }
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
    // No accidental text selection on the page while dragging/resizing.
    document.body.style.userSelect = 'none';
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      const el = ref.current;
      if (!g || !el) return;
      if (g.kind === 'move') {
        setPos(
          clampPos(
            { x: e.clientX - g.dx, y: e.clientY - g.dy },
            el.offsetWidth,
            el.offsetHeight,
          ),
        );
        return;
      }
      const r = el.getBoundingClientRect();
      setSize({
        w: Math.round(
          Math.min(
            Math.max(minWidth, g.w + e.clientX - g.x),
            window.innerWidth - r.left - MARGIN,
          ),
        ),
        h: Math.round(
          Math.min(
            Math.max(minHeight, g.h + e.clientY - g.y),
            window.innerHeight - r.top - MARGIN,
          ),
        ),
      });
    },
    [minWidth, minHeight],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      if (!g) return;
      gesture.current = null;
      ref.current?.releasePointerCapture(e.pointerId);
      document.body.style.userSelect = '';
      if (g.kind === 'move') {
        setPos((p) => {
          if (p) saveLayout(storageKey, { pos: p });
          return p;
        });
      } else {
        setSize((s) => {
          if (s) saveLayout(storageKey, { size: s });
          return s;
        });
      }
    },
    [storageKey],
  );

  function resetSize() {
    setSize(null);
    saveLayout(storageKey, { size: undefined });
  }

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
      style={{
        ...(pos ? { left: pos.x, top: pos.y } : { left: -9999, top: -9999 }),
        // Height is a minimum: the window never gets smaller than its content
        // (cells with a Veeam message are taller); extra room goes to the
        // note field via flex-grow.
        ...(size ? { width: size.w, minHeight: size.h } : {}),
        maxHeight: `calc(100dvh - ${2 * MARGIN}px)`,
      }}
      className={cn(
        'fixed z-[55] flex flex-col overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 shadow-pop focus:outline-none dark:bg-slate-900 dark:ring-slate-700',
        pos ? 'animate-fade-in' : 'invisible',
        className,
      )}
    >
      {children}
      {/* Resize grip, bottom-right. Double-click resets to the default size. */}
      <div
        data-resize-handle=""
        onDoubleClick={resetSize}
        title="Größe ändern (Doppelklick: zurücksetzen)"
        aria-hidden
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize touch-none text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M14 8 8 14M14 12l-2 2" />
        </svg>
      </div>
    </div>,
    document.body,
  );
}
