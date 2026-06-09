import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface Options {
  /** Inactivity in ms after which we consider the founder "stuck". */
  inactivityMs?: number;
  /** Initial grace period — never trigger before this. */
  initialGraceMs?: number;
  /** Force enable/disable from caller (e.g., wait for workspace data). */
  enabled?: boolean;
  /** Force trigger (e.g., user dismissed a checklist while incomplete). */
  forceTrigger?: boolean;
}

const SESSION_SHOWN_KEY = 'founder-help-nudge-shown-session';
const REVISIT_KEY = 'founder-help-nudge-page-visits';

function getPageVisits(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(REVISIT_KEY) || '{}');
  } catch {
    return {};
  }
}

function bumpPageVisits(path: string): number {
  const visits = getPageVisits();
  visits[path] = (visits[path] || 0) + 1;
  try {
    sessionStorage.setItem(REVISIT_KEY, JSON.stringify(visits));
  } catch { /* ignore */ }
  return visits[path];
}

function isDismissedFresh(path: string, userId: string | undefined): boolean {
  if (!userId) return false;
  try {
    const raw = localStorage.getItem(`founder-help-nudge-dismissed:${userId}:${path}`);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (Number.isNaN(ts)) return false;
    const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    return days < 5; // 5-day persistence (within 3-7 range)
  } catch {
    return false;
  }
}

function markShownThisSession() {
  try { sessionStorage.setItem(SESSION_SHOWN_KEY, '1'); } catch { /* ignore */ }
}

function alreadyShownThisSession(): boolean {
  try { return sessionStorage.getItem(SESSION_SHOWN_KEY) === '1'; } catch { return false; }
}

function isAnyModalOpen(): boolean {
  if (typeof document === 'undefined') return false;
  // Radix dialogs/sheets/popovers expose data-state="open"
  return Boolean(
    document.querySelector('[role="dialog"][data-state="open"]') ||
    document.querySelector('[role="alertdialog"][data-state="open"]')
  );
}

/**
 * Detects when a founder appears stuck:
 *  - 45-60s of inactivity after a 20s grace,
 *  - or revisited the same page twice without meaningful interaction,
 *  - or `forceTrigger` is set (e.g., dismissed onboarding while incomplete).
 *
 * Honors per-user/per-page dismissal (5 days), once-per-session, role guard,
 * and never triggers when another modal is open.
 */
export function useFounderStuckSignal({
  inactivityMs = 50_000,
  initialGraceMs = 20_000,
  enabled = true,
  forceTrigger = false,
}: Options = {}) {
  const { roles, profile } = useAuth();
  const location = useLocation();
  const isFounder = roles?.includes('founder');
  const path = location.pathname;
  const userId = profile?.id;

  const [show, setShow] = useState(false);
  const showRef = useRef(false);
  useEffect(() => { showRef.current = show; }, [show]);
  const lastActivityRef = useRef<number>(Date.now());
  const meaningfulClickRef = useRef<boolean>(false);
  const mountedAtRef = useRef<number>(Date.now());

  // Eligibility
  const eligible = Boolean(
    enabled && isFounder && !alreadyShownThisSession() && !isDismissedFresh(path, userId)
  );

  // Track repeated visit
  useEffect(() => {
    if (!eligible) return;
    const visits = bumpPageVisits(path);
    if (visits >= 2 && !meaningfulClickRef.current) {
      // Defer slightly so we don't show on initial paint
      const t = window.setTimeout(() => {
        if (!isAnyModalOpen()) setShow(true);
      }, 1500);
      return () => window.clearTimeout(t);
    }
  }, [path, eligible]);

  // Force trigger (e.g., dismissed onboarding while incomplete)
  useEffect(() => {
    if (!eligible || !forceTrigger) return;
    if (isAnyModalOpen()) return;
    setShow(true);
  }, [eligible, forceTrigger]);

  // Inactivity timer
  useEffect(() => {
    if (!eligible) return;

    mountedAtRef.current = Date.now();
    lastActivityRef.current = Date.now();
    meaningfulClickRef.current = false;

    const onActivity = (ev: Event) => {
      lastActivityRef.current = Date.now();
      if (ev.type === 'click' || ev.type === 'keydown') {
        const target = ev.target as HTMLElement | null;
        if (target?.closest('a, button, [role="button"], input, textarea, select')) {
          meaningfulClickRef.current = true;
        }
      }
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));

    const interval = window.setInterval(() => {
      if (show) return;
      const now = Date.now();
      const sinceMount = now - mountedAtRef.current;
      const sinceActivity = now - lastActivityRef.current;
      if (sinceMount < initialGraceMs) return;
      if (sinceActivity < inactivityMs) return;
      if (isAnyModalOpen()) return;
      setShow(true);
    }, 5_000);

    return () => {
      events.forEach(e => window.removeEventListener(e, onActivity));
      window.clearInterval(interval);
    };
  }, [eligible, inactivityMs, initialGraceMs, show]);

  const dismiss = () => {
    setShow(false);
    markShownThisSession();
    if (userId) {
      try {
        localStorage.setItem(
          `founder-help-nudge-dismissed:${userId}:${path}`,
          String(Date.now())
        );
      } catch { /* ignore */ }
    }
  };

  const acknowledge = () => {
    setShow(false);
    markShownThisSession();
  };

  return { show, dismiss, acknowledge, isFounder };
}
