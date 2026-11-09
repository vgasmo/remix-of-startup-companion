import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls to top on route change, or to the `#fragment` target once it exists.
 * Pages render lazily/after data loads, so the browser's native fragment scroll
 * misses the element (e.g. /my-workspaces#session-prep from the mobile nav).
 * Returns null — no DOM element, no ref warnings.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    let id = hash.slice(1);
    try { id = decodeURIComponent(id); } catch { /* keep raw id */ }
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (++tries < 40) timer = setTimeout(tick, 50); // wait up to ~2 s for the lazy page
      else window.scrollTo(0, 0);
    };
    tick();
    return () => { if (timer) clearTimeout(timer); };
  }, [pathname, hash]);

  return null;
}
