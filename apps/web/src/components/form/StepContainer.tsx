import type { ReactNode } from 'react';

type StepContainerProps = {
  title: string;
  description: string;
  errorSummary?: string | null;
  children: ReactNode;
};

export const StepContainer = ({
  title,
  description,
  errorSummary,
  children,
}: StepContainerProps): JSX.Element => (
  <section className="space-y-4">
    <header className="space-y-1">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-sky-700">
        Formulario por pasos
      </p>
      <h3 className="text-xl font-extrabold text-ink">{title}</h3>
      <p className="text-sm text-slate-600">{description}</p>
    </header>

    {errorSummary ? (
      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
        {errorSummary}
      </div>
    ) : null}

    {children}
  </section>
);

