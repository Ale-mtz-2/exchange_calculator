type StepperActionsProps = {
  stepIndex: number;
  totalSteps: number;
  canProceed: boolean;
  allStepsValid: boolean;
  loading: boolean;
  onBack: () => void;
  onNext: () => void;
};

export const StepperActions = ({
  stepIndex,
  totalSteps,
  canProceed,
  allStepsValid,
  loading,
  onBack,
  onNext,
}: StepperActionsProps): JSX.Element => {
  const isFinalStep = stepIndex === totalSteps - 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sky/12 pt-4">
      <button
        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={stepIndex === 0}
        onClick={onBack}
        type="button"
      >
        Anterior
      </button>

      {!isFinalStep ? (
        <button
          className="rounded-xl bg-gradient-to-r from-[#0f8bff] to-[#2e86c1] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(15,139,255,0.3)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canProceed}
          onClick={onNext}
          type="button"
        >
          Siguiente
        </button>
      ) : (
        <button
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0f8bff] to-[#2e86c1] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_28px_rgba(15,139,255,0.3)] transition-all duration-300 hover:shadow-[0_14px_36px_rgba(15,139,255,0.4)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading || !allStepsValid}
          type="submit"
        >
          <span className="relative z-10">
            {loading ? 'Generando...' : 'Generar plan de equivalentes'}
          </span>
          <span className="absolute inset-0 -z-0 bg-gradient-to-r from-[#2e86c1] to-[#0f8bff] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </button>
      )}
    </div>
  );
};

