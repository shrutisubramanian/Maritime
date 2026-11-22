import { useEffect, useState } from 'react';

const QUERY = '(max-width: 768px)';

/**
 * True when the viewport is phone-sized. Used by the sidebars (drawer mode)
 * and pages to collapse multi-column inline grids into single columns.
 */
export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
};
