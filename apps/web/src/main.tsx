import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';
import { BootSplash } from './components/BootSplash';
import './index.css';

const MIN_SPLASH_MS = 1200;
const EXIT_SPLASH_MS = 450;
const ONRENDER_HOST = 'exchange-calculator-web.onrender.com';

const normalizeOrigin = (value: string): string => value.trim().replace(/\/+$/, '');

const enforceCanonicalOrigin = (): void => {
  const canonicalOriginRaw = import.meta.env.VITE_CANONICAL_ORIGIN;
  if (!canonicalOriginRaw) {
    return;
  }

  let canonicalOrigin: string;
  try {
    canonicalOrigin = normalizeOrigin(new URL(canonicalOriginRaw).origin);
  } catch {
    console.warn('[canonical-origin-invalid]', { value: canonicalOriginRaw });
    return;
  }

  const currentOrigin = normalizeOrigin(window.location.origin);
  if (currentOrigin === canonicalOrigin) {
    return;
  }

  if (window.location.hostname !== ONRENDER_HOST) {
    return;
  }

  const nextUrl = `${canonicalOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(nextUrl);
};

const Root = (): JSX.Element => {
  const [splashPhase, setSplashPhase] = useState<'loading' | 'exiting' | 'done'>('loading');
  const mountedRef = useRef(true);
  const startRef = useRef(Date.now());

  useEffect(() => {
    mountedRef.current = true;

    const reveal = (): void => {
      const elapsed = Date.now() - startRef.current;
      const waitMs = Math.max(0, MIN_SPLASH_MS - elapsed);
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        setSplashPhase('exiting');
      }, waitMs);
    };

    if (document.readyState === 'complete') {
      reveal();
    } else {
      window.addEventListener('load', reveal, { once: true });
    }

    return () => {
      mountedRef.current = false;
      window.removeEventListener('load', reveal);
    };
  }, []);

  useEffect(() => {
    if (splashPhase !== 'exiting') return;

    const timer = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setSplashPhase('done');
    }, EXIT_SPLASH_MS);

    return () => window.clearTimeout(timer);
  }, [splashPhase]);

  if (splashPhase !== 'done') {
    return <BootSplash exiting={splashPhase === 'exiting'} />;
  }

  return <App />;
};

enforceCanonicalOrigin();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
