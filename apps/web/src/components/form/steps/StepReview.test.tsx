import type { PatientProfile } from '@equivalentes/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { StepReview } from './StepReview';

const baseProfile = (): PatientProfile => ({
  fullName: 'Paciente Demo',
  birthDate: '1994-02-22',
  waistCm: 90,
  hasDiabetes: false,
  hasHypertension: false,
  hasDyslipidemia: false,
  trainingWindow: 'none',
  usesDairyInSnacks: true,
  planningFocus: 'clinical',
  goal: 'lose_fat',
  goalDeltaKgPerWeek: 0.5,
  sex: 'male',
  age: 32,
  weightKg: 95,
  heightCm: 180,
  activityLevel: 'medium',
  mealsPerDay: 3,
  countryCode: 'MX',
  stateCode: 'DUR',
  systemId: 'mx_smae',
  formulaId: 'mifflin_st_jeor',
  dietPattern: 'omnivore',
  allergies: [],
  intolerances: [],
  likes: [],
  dislikes: [],
  budgetLevel: 'high',
  prepTimeLevel: 'medium',
});

const defaultCsvInputs = {
  allergiesText: '',
  intolerancesText: '',
  likesText: '',
  dislikesText: '',
};

const defaultPersonalPreferences = {
  prefersSweetSnacks: false,
  prefersSavorySnacks: false,
  avoidsUltraProcessed: false,
};

describe('StepReview', () => {
  it('shows no-snack note when mealsPerDay is 3', () => {
    const html = renderToStaticMarkup(
      <StepReview
        profile={baseProfile()}
        personalPreferences={defaultPersonalPreferences}
        csvInputs={defaultCsvInputs}
        onCsvChange={vi.fn()}
        onGoToStep={vi.fn()}
      />,
    );

    expect(html).toContain('Con 3 comidas por dia no se generan colaciones separadas');
  });

  it('does not show no-snack note when mealsPerDay is 4 or 5', () => {
    const html4 = renderToStaticMarkup(
      <StepReview
        profile={{ ...baseProfile(), mealsPerDay: 4 }}
        personalPreferences={defaultPersonalPreferences}
        csvInputs={defaultCsvInputs}
        onCsvChange={vi.fn()}
        onGoToStep={vi.fn()}
      />,
    );
    const html5 = renderToStaticMarkup(
      <StepReview
        profile={{ ...baseProfile(), mealsPerDay: 5 }}
        personalPreferences={defaultPersonalPreferences}
        csvInputs={defaultCsvInputs}
        onCsvChange={vi.fn()}
        onGoToStep={vi.fn()}
      />,
    );

    expect(html4).not.toContain('Con 3 comidas por dia no se generan colaciones separadas');
    expect(html5).not.toContain('Con 3 comidas por dia no se generan colaciones separadas');
  });
});
