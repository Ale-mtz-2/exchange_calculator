import { useRef, useState } from 'react';

import type { Goal } from '@equivalentes/shared';

type GoalDeltaHoldBarProps = {
  goal: Goal;
  value: number;
  onChange: (nextValue: number) => void;
  min?: number;
  max?: number;
  recommended?: number;
};

type TouchLike = {
  identifier: number;
  clientX: number;
};

type TouchListLike = {
  length: number;
  item: (index: number) => TouchLike | null;
};

const clamp = (value: number, minValue: number, maxValue: number): number =>
  Math.min(maxValue, Math.max(minValue, value));

const round = (value: number, digits = 2): number => {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
};

const DOWNLOAD_GREEN_GRADIENT =
  'var(--brand-green-gradient, linear-gradient(90deg, #10b981 0%, #16a34a 100%))';
const DOWNLOAD_GREEN_DARK_GRADIENT =
  'var(--brand-green-gradient-dark, linear-gradient(90deg, #16a34a 0%, #15803d 55%, #166534 100%))';

const getHelperText = (goal: Goal): string => {
  if (goal === 'lose_fat') {
    return 'Arrastra la barra para definir cuanto peso deseas perder por semana.';
  }

  if (goal === 'gain_muscle') {
    return 'Arrastra la barra para definir cuanto peso deseas subir por semana.';
  }

  return 'En objetivo mantener, la meta semanal se mantiene en 0.';
};

export const GoalDeltaHoldBar = ({
  goal,
  value,
  onChange,
  min = 0,
  max = 1,
  recommended = 0,
}: GoalDeltaHoldBarProps): JSX.Element => {
  const isMaintain = goal === 'maintain';
  const isDisabled = isMaintain || max <= min;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activeTouchIdRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;

  const normalizedValue = isMaintain ? 0 : clamp(value, min, max);
  const visualMin = isMaintain ? 0 : min;
  const visualMax = isMaintain ? 1 : max;
  const visualRecommended = isMaintain ? 0 : clamp(recommended, min, max);
  const fillPct = ((normalizedValue - visualMin) / Math.max(0.0001, visualMax - visualMin)) * 100;
  const recommendedPct = ((visualRecommended - visualMin) / Math.max(0.0001, visualMax - visualMin)) * 100;
  const thumbPct = clamp(fillPct, 2, 98);
  const fillTrackPct = isMaintain ? 10 : Math.max(fillPct, 4);
  const actionLabel = goal === 'lose_fat' ? 'perder' : goal === 'gain_muscle' ? 'subir' : 'mantener';
  const rangeLabel =
    goal === 'lose_fat'
      ? 'Rango saludable: 0.25-0.75 kg/semana'
      : goal === 'gain_muscle'
        ? 'Rango saludable: 0.10-0.40 kg/semana'
        : 'Rango saludable: objetivo mantener (0.00 kg/semana)';

  const updateFromClientX = (clientX: number): void => {
    if (isDisabled || !trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const rawValue = min + ratio * (max - min);
    onChange(round(rawValue));
  };

  const stopDragging = (): void => {
    setIsDragging(false);
    activePointerIdRef.current = null;
    activeTouchIdRef.current = null;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (isDisabled || !supportsPointerEvents) return;

    activePointerIdRef.current = event.pointerId;
    setIsDragging(true);
    if ('setPointerCapture' in event.currentTarget) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Safari may throw if capture is not available for the active pointer.
      }
    }
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!supportsPointerEvents || !isDragging) return;
    if (activePointerIdRef.current !== event.pointerId) return;
    updateFromClientX(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!supportsPointerEvents) return;
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== event.pointerId) return;
    stopDragging();
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!supportsPointerEvents) return;
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== event.pointerId) return;
    stopDragging();
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!supportsPointerEvents || !isDragging) return;
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== event.pointerId) return;

    if (
      'hasPointerCapture' in event.currentTarget &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      return;
    }

    stopDragging();
  };

  const handleLostPointerCapture = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!supportsPointerEvents) return;
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== event.pointerId) return;
    stopDragging();
  };

  const resolveTrackedTouch = (touches: TouchListLike): TouchLike | null => {
    if (activeTouchIdRef.current === null) return null;

    for (let index = 0; index < touches.length; index += 1) {
      const touch = touches.item(index);
      if (touch && touch.identifier === activeTouchIdRef.current) {
        return touch;
      }
    }

    return null;
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>): void => {
    if (isDisabled || supportsPointerEvents) return;

    const touch = event.changedTouches.item(0);
    if (!touch) return;

    activeTouchIdRef.current = touch.identifier;
    setIsDragging(true);
    updateFromClientX(touch.clientX);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>): void => {
    if (!isDragging || supportsPointerEvents) return;

    const touch = resolveTrackedTouch(event.touches);
    if (!touch) return;

    event.preventDefault();
    updateFromClientX(touch.clientX);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>): void => {
    if (supportsPointerEvents) return;

    const touch = resolveTrackedTouch(event.changedTouches);
    if (!touch) return;

    stopDragging();
  };

  const handleTouchCancel = (): void => {
    if (supportsPointerEvents) return;
    stopDragging();
  };

  const applyHealthyAuto = (): void => {
    if (isDisabled) return;
    onChange(round(clamp(recommended, min, max)));
  };

  return (
    <div className="rounded-2xl border border-sky/15 bg-gradient-to-r from-sky-50/70 to-white p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-navy">Meta semanal de peso</p>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-sky">
          {normalizedValue.toFixed(2)} kg/semana
        </span>
      </div>
      <p className="mt-2 inline-flex rounded-full border border-sky/25 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
        {rangeLabel}
      </p>

      <div
        ref={trackRef}
        className={`touch-pan-y relative mt-3 h-11 overflow-hidden rounded-full border-2 shadow-[inset_0_2px_6px_rgba(15,23,42,0.14)] md:h-7 ${isDisabled ? 'cursor-not-allowed' : 'cursor-ew-resize'}`}
        style={{
          background: 'var(--brand-green-track-bg, #f8fafc)',
          borderColor: 'var(--brand-green-border, #34d399)',
          touchAction: isDisabled ? 'auto' : 'pan-y',
          userSelect: isDragging ? 'none' : 'auto',
          WebkitUserSelect: isDragging ? 'none' : 'auto',
        }}
        onLostPointerCapture={handleLostPointerCapture}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onTouchCancel={handleTouchCancel}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        role="slider"
        aria-label="Meta semanal de peso"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={normalizedValue}
        aria-valuetext={`${normalizedValue.toFixed(2)} kg/semana`}
        aria-disabled={isDisabled}
      >
        {!isMaintain ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-20"
            style={{
              left: `${recommendedPct}%`,
              width: '2px',
              background: 'var(--brand-green-marker, #047857)',
              opacity: 0.92,
            }}
          />
        ) : null}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 z-10 rounded-full shadow-[0_4px_12px_rgba(22,163,74,0.5)] transition-all duration-100"
          style={{
            width: `${fillTrackPct}%`,
            background: DOWNLOAD_GREEN_DARK_GRADIENT,
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-35"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 80%)' }}
          />
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 z-30 h-8 w-8 -translate-y-1/2 rounded-full border-[3px] border-white"
          style={{
            left: `${thumbPct}%`,
            transform: 'translate(-50%, -50%)',
            background: isDisabled ? '#cbd5e1' : DOWNLOAD_GREEN_GRADIENT,
            boxShadow: isDisabled
              ? '0 0 0 4px rgba(226,232,240,1), 0 6px 12px rgba(100,116,139,0.35)'
              : '0 0 0 4px rgba(167,243,208,0.9), 0 8px 16px rgba(22,163,74,0.5)',
          }}
        >
          <span
            className={`absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${isDisabled ? 'bg-slate-300' : 'bg-white'}`}
          />
        </span>
      </div>
      {!isMaintain ? (
        <div className="mt-2 grid grid-cols-3 text-[11px] font-semibold text-slate-500">
          <span>{min.toFixed(2)} min</span>
          <span className="text-center">{recommended.toFixed(2)} recomendado</span>
          <span className="text-right">{max.toFixed(2)} max</span>
        </div>
      ) : (
        <p className="mt-2 text-[11px] font-semibold text-slate-500">
          Valor fijo para mantener: 0.00 kg/semana.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          className="rounded-xl border border-sky/25 bg-white px-3 py-1.5 text-xs font-bold text-sky transition hover:border-sky hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isDisabled}
          onClick={applyHealthyAuto}
          type="button"
        >
          Auto saludable
        </button>
        <span className="text-xs text-slate-500">Meta para {actionLabel}</span>
      </div>

      <p className="mt-2 text-xs text-slate-500">{getHelperText(goal)}</p>
    </div>
  );
};
