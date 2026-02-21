import type { PatientProfile } from '@equivalentes/shared';

import {
  formatPersonalPreferencesSummary,
  type PersonalPreferences,
} from '../../../lib/personalPreferences';
import { fieldLabelClass, inputClass } from '../formStyles';
import { deriveAgeFromBirthDate } from '../validators';

type CsvInputs = {
  allergiesText: string;
  intolerancesText: string;
  likesText: string;
  dislikesText: string;
};

type StepReviewProps = {
  profile: PatientProfile;
  personalPreferences: PersonalPreferences;
  csvInputs: CsvInputs;
  onCsvChange: (field: keyof CsvInputs, value: string) => void;
  onGoToStep: (index: number) => void;
};

const goalLabelMap: Record<PatientProfile['goal'], string> = {
  maintain: 'Mantener',
  lose_fat: 'Perder grasa',
  gain_muscle: 'Ganar musculo',
};

const sexLabelMap: Record<PatientProfile['sex'], string> = {
  female: 'Femenino',
  male: 'Masculino',
};

const activityLabelMap: Record<PatientProfile['activityLevel'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

const dietPatternLabelMap: Record<PatientProfile['dietPattern'], string> = {
  omnivore: 'Omnivoro',
  vegetarian: 'Vegetariano',
  vegan: 'Vegano',
  pescatarian: 'Pescetariano',
};

const budgetLabelMap: Record<PatientProfile['budgetLevel'], string> = {
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
};

const prepTimeLabelMap: Record<PatientProfile['prepTimeLevel'], string> = {
  short: 'Corto',
  medium: 'Medio',
  long: 'Largo',
};

const planningFocusLabelMap: Record<PatientProfile['planningFocus'], string> = {
  clinical: 'Clinico',
  hybrid_sport: 'Clinico + Deportivo (simetrico)',
};

const SummaryCard = ({
  title,
  lines,
  stepIndex,
  onGoToStep,
}: {
  title: string;
  lines: string[];
  stepIndex: number;
  onGoToStep: (index: number) => void;
}): JSX.Element => (
  <article className="rounded-2xl border border-sky/15 bg-white/85 p-3.5">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h4 className="text-sm font-bold text-ink">{title}</h4>
      <button
        className="rounded-lg border border-sky/25 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky transition hover:border-sky hover:bg-sky-50"
        onClick={() => onGoToStep(stepIndex)}
        type="button"
      >
        Editar
      </button>
    </div>
    <ul className="space-y-1 text-xs text-slate-600">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  </article>
);

export const StepReview = ({
  profile,
  personalPreferences,
  csvInputs,
  onCsvChange,
  onGoToStep,
}: StepReviewProps): JSX.Element => {
  const derivedAge = profile.birthDate ? deriveAgeFromBirthDate(profile.birthDate) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className={fieldLabelClass}>
          Alergias (coma separada)
          <input
            className={inputClass}
            value={csvInputs.allergiesText}
            onChange={(event) => onCsvChange('allergiesText', event.target.value)}
            placeholder="cacahuate, mariscos"
          />
        </label>

        <label className={fieldLabelClass}>
          Intolerancias (coma separada)
          <input
            className={inputClass}
            value={csvInputs.intolerancesText}
            onChange={(event) => onCsvChange('intolerancesText', event.target.value)}
            placeholder="lactosa, gluten"
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SummaryCard
          title="Objetivo y meta"
          stepIndex={0}
          onGoToStep={onGoToStep}
          lines={[
            `Nombre completo: ${profile.fullName.trim() || 'Sin capturar'}`,
            `Objetivo: ${goalLabelMap[profile.goal]}`,
            `Meta semanal: ${profile.goalDeltaKgPerWeek.toFixed(2)} kg/semana`,
            `Formula: ${profile.formulaId}`,
          ]}
        />
        <SummaryCard
          title="Datos antropometricos"
          stepIndex={1}
          onGoToStep={onGoToStep}
          lines={[
            `Sexo: ${sexLabelMap[profile.sex]}`,
            `Peso: ${profile.weightKg} kg`,
            `Estatura: ${profile.heightCm} cm`,
            `Cintura: ${profile.waistCm ?? 'Sin dato'} cm`,
            `Actividad: ${activityLabelMap[profile.activityLevel]}`,
            `Comidas por dia: ${profile.mealsPerDay}`,
          ]}
        />
        <SummaryCard
          title="Contexto regional"
          stepIndex={2}
          onGoToStep={onGoToStep}
          lines={[
            `Pais: ${profile.countryCode}`,
            `Estado/provincia: ${profile.stateCode}`,
            `Sistema: ${profile.systemId}`,
          ]}
        />
        <SummaryCard
          title="Habitos y preferencias"
          stepIndex={3}
          onGoToStep={onGoToStep}
          lines={[
            `Patron: ${dietPatternLabelMap[profile.dietPattern]}`,
            `Presupuesto: ${budgetLabelMap[profile.budgetLevel]}`,
            `Preparacion: ${prepTimeLabelMap[profile.prepTimeLevel]}`,
            `Likes: ${csvInputs.likesText.trim() || 'Sin preferencias'}`,
            `Dislikes: ${csvInputs.dislikesText.trim() || 'Sin exclusiones'}`,
          ]}
        />
        <SummaryCard
          title="Perfil clinico"
          stepIndex={4}
          onGoToStep={onGoToStep}
          lines={[
            `Nacimiento: ${profile.birthDate || 'Sin dato'}`,
            `Edad calculada: ${derivedAge ?? 'Sin dato'} anios`,
            `Ventana entrenamiento: ${profile.trainingWindow}`,
            `Enfoque del plan: ${planningFocusLabelMap[profile.planningFocus]}`,
            `Diabetes: ${profile.hasDiabetes ? 'Si' : 'No'}`,
            `Hipertension: ${profile.hasHypertension ? 'Si' : 'No'}`,
            `Dislipidemia: ${profile.hasDyslipidemia ? 'Si' : 'No'}`,
            `Preferencias personales: ${formatPersonalPreferencesSummary(profile.usesDairyInSnacks, personalPreferences)}`,
          ]}
        />
      </div>
    </div>
  );
};
