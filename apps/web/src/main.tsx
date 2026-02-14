import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';
import { BootSplash } from './components/BootSplash';
import './index.css';

const MIN_SPLASH_MS = 1200;
const EXIT_SPLASH_MS = 450;

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
