import { Suspense, lazy, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';

import logo from './assets/FitPilot-Logo.svg';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ParticlesBackground } from './components/ParticlesBackground';
import { HomePage } from './pages/HomePage';

const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })),
);

const isAdminHost = (hostname: string): boolean =>
  hostname.startsWith('admin.') || hostname === 'admin.localhost';

const navClass = ({ isActive }: { isActive: boolean }): string =>
  [
    'rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-300',
    isActive
      ? 'bg-gradient-to-r from-[#0f8bff] to-[#2e86c1] text-white shadow-[0_8px_24px_rgba(103,182,223,0.35)]'
      : 'border border-sky-100 bg-white/80 text-ink hover:border-sky/40 hover:bg-white hover:shadow-[0_4px_12px_rgba(103,182,223,0.15)]',
  ].join(' ');

const LoadingSpinner = (): JSX.Element => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-200 border-t-sky-500" />
  </div>
);

export const App = (): JSX.Element => {
  const [menuOpen, setMenuOpen] = useState(false);
  const envShowAdminLink = import.meta.env.VITE_SHOW_ADMIN_LINK === 'true';
  const showAdminLink =
    envShowAdminLink ||
    (typeof window !== 'undefined' ? isAdminHost(window.location.hostname) : false);

  return (
    <BrowserRouter>
      <ParticlesBackground />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 md:px-8 md:py-6">
        {/* ─── Header ─── */}
        <header className="no-print relative mb-6 rounded-3xl border border-sky-100 bg-white/80 p-4 shadow-[0_12px_40px_rgba(24,47,80,0.1)] backdrop-blur-xl md:p-5">
          <div className="flex items-center justify-between gap-3">
            {/* Logo + brand */}
            <NavLink to="/" className="flex min-w-0 items-center gap-3 no-underline">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky/20 bg-gradient-to-br from-white to-sky-50 p-1.5 shadow-[0_6px_16px_rgba(103,182,223,0.2)] transition-transform duration-300 hover:scale-105 md:h-12 md:w-12">
                <img alt="FitPilot" className="h-full w-full object-contain" src={logo} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky">
                  FitPilot
                </p>
                <h1 className="truncate text-base font-extrabold leading-tight text-ink md:text-xl lg:text-[1.4rem]">
                  Calculadora de equivalentes
                </h1>
              </div>
            </NavLink>

            {/* Desktop nav */}
            <nav className="hidden items-center gap-2 md:flex">
              <NavLink to="/" className={navClass} end>
                Herramienta
              </NavLink>
              {showAdminLink ? (
                <NavLink to="/admin" className={navClass}>
                  Admin
                </NavLink>
              ) : null}
            </nav>

            {/* Mobile hamburger */}
            <button
              aria-label="Menú"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-100 bg-white/90 text-ink transition hover:bg-sky-50 md:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
              type="button"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                {menuOpen ? (
                  <path
                    d="M6 18L18 6M6 6l12 12"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : (
                  <path
                    d="M4 6h16M4 12h16M4 18h16"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile nav dropdown */}
          {menuOpen && (
            <nav className="mt-3 flex flex-col gap-2 border-t border-sky-100 pt-3 md:hidden">
              <NavLink
                to="/"
                className={navClass}
                end
                onClick={() => setMenuOpen(false)}
              >
                Herramienta
              </NavLink>
              {showAdminLink ? (
                <NavLink
                  to="/admin"
                  className={navClass}
                  onClick={() => setMenuOpen(false)}
                >
                  Admin
                </NavLink>
              ) : null}
            </nav>
          )}
        </header>

        {/* ─── Main ─── */}
        <main className="flex-1">
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/admin" element={<AdminPage />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>

        {/* ─── Footer ─── */}
        <footer className="no-print mt-10 rounded-3xl border border-sky-100 bg-white/60 px-6 py-5 text-center backdrop-blur-lg">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2">
              <img alt="FitPilot" className="h-7 w-7" src={logo} />
              <span className="text-sm font-bold text-ink">FitPilot</span>
            </div>
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} FitPilot — Calculadora dinámica de
              equivalentes alimentarios
            </p>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
};

