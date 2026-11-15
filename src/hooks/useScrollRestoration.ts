import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/**
 * Resets scroll on mobile navigation and restores it for desktop admin pages.
 * Disables browser's automatic scroll restoration.
 */
export function useScrollRestoration(isMobileApp: boolean) {
  const location = useLocation();
  const scrollPositions = useRef<Record<string, number>>({});

  // Disable browser's automatic scroll restoration
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);

  useLayoutEffect(() => {
    const currentPath = location.pathname;

    if (isMobileApp || window.innerWidth < 1024) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }

    if (!currentPath.startsWith('/admin')) return;

    const handleScroll = () => {
      scrollPositions.current[currentPath] = window.scrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    const savedPosition = scrollPositions.current[currentPath];
    if (savedPosition !== undefined && savedPosition > 0) {
      window.scrollTo({ top: savedPosition, behavior: 'instant' });
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isMobileApp, location.pathname]);
}
