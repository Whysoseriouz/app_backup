'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  isPageBusy,
  setPendingPath,
  usePageBusyState,
  usePendingPath,
} from '@/lib/navigation';
import { cn } from '@/lib/utils';

/**
 * Page switches: as soon as an internal link is clicked, dim the page below
 * the NavBar with a spinner until the new page has rendered its content.
 * Works for every internal link (menu, briefing tiles, "Matrix" …).
 *
 * The overlay is switched on in the click handler itself – the following
 * render of the new page can block the main thread, so a JS timer would not
 * fire in time. The fade-in delay is done in CSS instead (runs on the
 * compositor), which also keeps very fast switches from flashing.
 */
export function NavigationOverlay() {
  const pathname = usePathname();
  const pending = usePendingPath();
  const pageBusy = usePageBusyState();

  // Path React has actually rendered (the URL can change a bit earlier).
  const shownPath = useRef(pathname);
  useEffect(() => {
    shownPath.current = pathname;
  }, [pathname]);

  // Catch clicks on internal links before Next.js starts its transition.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === shownPath.current) return;
      setPendingPath(url.pathname);
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Done once the new page is rendered and reports no more building work
  // (pages with data still loading keep it up via usePageBusy).
  useEffect(() => {
    if (!pending || pathname !== pending || pageBusy) return;
    const id = setTimeout(() => {
      if (!isPageBusy()) setPendingPath(null);
    }, 16);
    return () => clearTimeout(id);
  }, [pending, pathname, pageBusy]);

  // Safety nets: redirect/back-forward landed elsewhere, or something hangs.
  useEffect(() => {
    if (!pending) return;
    const elsewhere = setTimeout(() => {
      if (shownPath.current !== pending) setPendingPath(null);
    }, 4000);
    const giveUp = setTimeout(() => setPendingPath(null), 8000);
    return () => {
      clearTimeout(elsewhere);
      clearTimeout(giveUp);
    };
  }, [pending]);

  const active = pending !== null;
  return (
    <div
      aria-hidden={!active}
      className={cn(
        'fixed inset-x-0 bottom-0 top-[67px] z-[45] flex items-center justify-center bg-white/60 backdrop-blur-[1px] transition-opacity dark:bg-slate-950/60 no-print',
        active
          ? 'opacity-100 duration-150 delay-150'
          : 'pointer-events-none opacity-0 duration-200',
      )}
    >
      <div className="flex items-center gap-2.5 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-pop ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
        <Loader2 className="h-5 w-5 animate-spin text-osk-500" />
        Lädt …
      </div>
    </div>
  );
}
