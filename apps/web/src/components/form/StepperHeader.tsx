type StepperHeaderProps = {
  steps: ReadonlyArray<{ title: string; shortTitle?: string }>;
  activeStep: number;
  maxReachableStep: number;
  completedMap: boolean[];
  onSelectStep: (index: number) => void;
};

export const StepperHeader = ({
  steps,
  activeStep,
  maxReachableStep,
  completedMap,
  onSelectStep,
}: StepperHeaderProps): JSX.Element => {
  const progress = ((activeStep + 1) / steps.length) * 100;

  return (
    <div className="rounded-2xl border border-sky/15 bg-white/80 p-3 shadow-[0_8px_26px_rgba(24,47,80,0.08)] backdrop-blur-sm">
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-sky-100/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#0f8bff] to-[#2e86c1] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="no-scrollbar touch-pan-x flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
        {steps.map((step, index) => {
          const isActive = index === activeStep;
          const isCompleted = completedMap[index] ?? false;
          const isClickable = index <= activeStep || index <= maxReachableStep;
          const title = step.shortTitle ?? step.title;

          return (
            <button
              key={step.title}
              className={[
                'min-w-[140px] shrink-0 snap-start rounded-xl border px-3 py-2 text-left text-xs font-semibold transition md:min-w-[170px]',
                isActive
                  ? 'border-transparent bg-gradient-to-r from-[#0f8bff] to-[#2e86c1] text-white shadow-[0_8px_20px_rgba(15,139,255,0.35)]'
                  : isCompleted
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-sky/20 bg-white text-slate-600',
                !isClickable ? 'opacity-70' : 'hover:border-sky/45 hover:bg-sky-50/70',
              ].join(' ')}
              onClick={() => onSelectStep(index)}
              type="button"
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span
                  className={[
                    'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-extrabold',
                    isActive
                      ? 'bg-white/20 text-white'
                      : isCompleted
                        ? 'bg-emerald-500 text-white'
                        : 'bg-sky-100 text-sky-700',
                  ].join(' ')}
                >
                  {isCompleted ? '\u2713' : index + 1}
                </span>
                <span className="uppercase tracking-[0.08em]">
                  Paso {index + 1}
                </span>
              </div>
              <p className="line-clamp-2 leading-tight">{title}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
