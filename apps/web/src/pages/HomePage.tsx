import {
  COUNTRY_OPTIONS,
  COUNTRY_STATES,
  EXCHANGE_SYSTEMS,
  KCAL_FORMULAS,
  distributeMeals,
  type EquivalentGroupPlan,
  type EquivalentPlanResponse,
  type PatientProfile,
  type RankedFoodItem,
} from '@equivalentes/shared';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { HeroIllustration } from '../components/HeroIllustration';
import { MacroPieChart } from '../components/MacroPieChart';
import { MealDistributionTable } from '../components/MealDistributionTable';
import { BootSplash } from '../components/BootSplash';
import { StepContainer } from '../components/form/StepContainer';
import { StepperActions } from '../components/form/StepperActions';
import { StepperHeader } from '../components/form/StepperHeader';
import { StepAnthropometry } from '../components/form/steps/StepAnthropometry';
import { StepGoal } from '../components/form/steps/StepGoal';
import { StepHabits } from '../components/form/steps/StepHabits';
import { StepRegion } from '../components/form/steps/StepRegion';
import { StepReview } from '../components/form/steps/StepReview';
import { LeadCaptureModal } from '../components/LeadCaptureModal';
import {
  WEEKLY_GOAL_SETTINGS,
  clampWeeklyGoalDelta,
  getFirstInvalidStepIndex,
  validateAnthropometryStep,
  validateGoalStep,
  validateHabitsStep,
  validateRegionStep,
  validateReviewStep,
} from '../components/form/validators';
import { generatePlan, getOptions, postEvent, type AppOptions } from '../lib/api';
import { downloadEquivalentListExcel } from '../lib/exportEquivalentListExcel';
import { downloadClinicalPdf, PDF_EXTENDED_FOODS_LIMIT } from '../lib/pdfClinicalReport';
import { resolveTrackingIdentity } from '../lib/trackingIdentity';

const parseCsvText = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const defaultProfile = (): PatientProfile => ({
  goal: 'maintain',
  goalDeltaKgPerWeek: 0,
  sex: 'female',
  age: 30,
  weightKg: 65,
  heightCm: 165,
  activityLevel: 'medium',
  mealsPerDay: 4,
  countryCode: 'MX',
  stateCode: 'CMX',
  systemId: 'mx_smae',
  formulaId: 'mifflin_st_jeor',
  dietPattern: 'omnivore',
  allergies: [],
  intolerances: [],
  likes: [],
  dislikes: [],
  budgetLevel: 'medium',
  prepTimeLevel: 'medium',
});

const MAX_DYNAMIC_EXCHANGES = 24;

const FORM_STEPS = [
  {
    title: 'Objetivo y meta',
    shortTitle: 'Objetivo',
    description:
      'Selecciona objetivo, meta semanal en kg/semana y formula para el calculo de kcal.',
  },
  {
    title: 'Datos antropometricos',
    shortTitle: 'Antropometria',
    description:
      'Captura sexo, edad, peso, estatura, actividad y numero de comidas por dia.',
  },
  {
    title: 'Contexto regional',
    shortTitle: 'Region',
    description:
      'Define pais, estado/provincia y sistema de equivalentes compatible con el contexto.',
  },
  {
    title: 'Habitos y preferencias',
    shortTitle: 'Habitos',
    description:
      'Ajusta patron alimentario, presupuesto, tiempo de preparacion y preferencias.',
  },
  {
    title: 'Restricciones y revision',
    shortTitle: 'Revision',
    description:
      'Completa alergias/intolerancias, revisa todo lo capturado y genera el plan final.',
  },
] as const;

const round = (value: number, digits = 1): number => {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
};

const roundHalf = (value: number): number => Math.max(0, Math.round(value * 2) / 2);

/** Like roundHalf but allows negative values — needed for adjustment deltas */
const roundHalfSigned = (value: number): number => Math.round(value * 2) / 2;

/** Groups excluded from automatic rebalancing (fixed portions per SMAE) */
const NON_REBALANCE_GROUPS = new Set(['vegetable', 'fruit']);

const clamp = (value: number, minValue: number, maxValue: number): number =>
  Math.min(maxValue, Math.max(minValue, value));

const getDefaultState = (options: AppOptions | null, countryCode: string): string => {
  const list =
    options?.statesByCountry[countryCode] ??
    COUNTRY_STATES[countryCode as keyof typeof COUNTRY_STATES];
  return list?.[0]?.code ?? '';
};

const getDefaultSystem = (options: AppOptions | null, countryCode: string): string => {
  const list = options?.systems ?? EXCHANGE_SYSTEMS;
  return list.find((system) => system.countryCode === countryCode)?.id ?? 'mx_smae';
};

const applyGroupAdjustments = (
  groupPlan: EquivalentGroupPlan[],
  adjustments: Record<string, number>,
): EquivalentGroupPlan[] =>
  groupPlan.map((group) => {
    const key = String(group.groupCode);
    const delta = adjustments[key] ?? 0;
    if (!delta) return group;

    const baseExchanges = Number(group.exchangesPerDay);
    const nextExchanges = roundHalf(clamp(baseExchanges + delta, 0, MAX_DYNAMIC_EXCHANGES));

    if (baseExchanges <= 0) {
      return {
        ...group,
        exchangesPerDay: nextExchanges,
      };
    }

    const choPerExchange = group.choG / baseExchanges;
    const proPerExchange = group.proG / baseExchanges;
    const fatPerExchange = group.fatG / baseExchanges;
    const kcalPerExchange = group.kcal / baseExchanges;

    return {
      ...group,
      exchangesPerDay: nextExchanges,
      choG: round(choPerExchange * nextExchanges),
      proG: round(proPerExchange * nextExchanges),
      fatG: round(fatPerExchange * nextExchanges),
      kcal: round(kcalPerExchange * nextExchanges, 0),
    };
  });

const groupTopFoods = (
  rankedFoods: RankedFoodItem[],
  limit = 6,
): Record<string, RankedFoodItem[]> => {
  const grouped: Record<string, RankedFoodItem[]> = {};

  for (const food of rankedFoods) {
    const key = String(food.subgroupCode ?? food.groupCode);
    const bucket = grouped[key] ?? [];
    if (bucket.length >= limit) continue;
    bucket.push(food);
    grouped[key] = bucket;
  }

  return grouped;
};

const FeatureIcon = ({ d, color = '#67b6df' }: { d: string; color?: string }): JSX.Element => (
  <div
    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
    style={{ background: `${color}18` }}
  >
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  </div>
);

const FEATURES = [
  {
    icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    title: 'Calculo inteligente',
    desc: 'Formulas validadas para estimar requerimientos caloricos y distribucion de macronutrientes.',
    color: '#67b6df',
  },
  {
    icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    title: 'Multi-pais',
    desc: 'Soporte para sistemas de equivalentes de diferentes paises y regiones.',
    color: '#1a5276',
  },
  {
    icon: 'M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    title: 'Exportacion Excel y PDF',
    desc: 'Descarga lista de equivalentes en Excel y reporte clinico en PDF.',
    color: '#2e86c1',
  },
  {
    icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    title: 'Personalizacion',
    desc: 'Ajusta alergias, intolerancias, preferencias, presupuesto y mas.',
    color: '#67b6df',
  },
];

type CsvInputs = {
  allergiesText: string;
  intolerancesText: string;
  likesText: string;
  dislikesText: string;
};

type ViewPhase = 'form' | 'generating' | 'result';

export const HomePage = (): JSX.Element => {
  const location = useLocation();
  const trackingIdentity = useMemo(() => resolveTrackingIdentity(location.search), [location.search]);
  const { cid, source, identityMode, isGuest, manychatEligible, attribution } = trackingIdentity;

  const [options, setOptions] = useState<AppOptions | null>(null);
  const [profile, setProfile] = useState<PatientProfile>(defaultProfile);
  const [csvInputs, setCsvInputs] = useState<CsvInputs>({
    allergiesText: '',
    intolerancesText: '',
    likesText: '',
    dislikesText: '',
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [viewPhase, setViewPhase] = useState<ViewPhase>('form');
  const [openTracked, setOpenTracked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<EquivalentPlanResponse | null>(null);
  const [groupAdjustments, setGroupAdjustments] = useState<Record<string, number>>({});
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const isGenerating = viewPhase === 'generating';

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await getOptions();
        setOptions(loaded);

        setProfile((prev) => ({
          ...prev,
          stateCode: getDefaultState(loaded, prev.countryCode),
          systemId: getDefaultSystem(loaded, prev.countryCode) as PatientProfile['systemId'],
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cargando opciones');
      }
    })();
  }, []);

  useEffect(() => {
    setOpenTracked(false);
  }, [cid]);

  useEffect(() => {
    if (!cid || openTracked) return;

    void postEvent({ cid, event: 'open', meta: { source, identityMode, attribution } })
      .then(() => {
        setOpenTracked(true);
      })
      .catch(() => {
        // fail-soft tracking
      });
  }, [attribution, cid, identityMode, openTracked, source]);

  const countryOptions = useMemo(() => {
    const configured = options?.countries ?? COUNTRY_OPTIONS;
    return configured.map((country) => ({ code: country.code, name: country.name }));
  }, [options]);

  const stateOptions = useMemo(() => {
    const configured = options?.statesByCountry[profile.countryCode] ?? [];
    if (configured.length > 0) {
      return configured.map((state) => ({ code: state.code, name: state.name }));
    }

    const fallback = COUNTRY_STATES[profile.countryCode as keyof typeof COUNTRY_STATES] ?? [];
    return fallback.map((state) => ({ code: state.code, name: state.name }));
  }, [options, profile.countryCode]);

  const systemOptions = useMemo(() => {
    const configured = options?.systems ?? EXCHANGE_SYSTEMS;
    return configured.filter((system) => system.countryCode === profile.countryCode);
  }, [options, profile.countryCode]);

  const formulaOptions = useMemo(
    () =>
      (options?.formulas ?? KCAL_FORMULAS).map((formula) => ({
        id: formula.id,
        name: formula.name,
        description: formula.description,
      })),
    [options],
  );

  const stepValidations = useMemo(
    () => [
      validateGoalStep(profile),
      validateAnthropometryStep(profile),
      validateRegionStep(
        profile,
        stateOptions.map((state) => state.code),
        systemOptions.map((system) => system.id),
      ),
      validateHabitsStep(profile),
      validateReviewStep(),
    ],
    [profile, stateOptions, systemOptions],
  );

  const firstInvalidStepIndex = getFirstInvalidStepIndex(stepValidations);
  const allStepsValid = firstInvalidStepIndex === -1;
  const maxReachableStep =
    firstInvalidStepIndex === -1 ? FORM_STEPS.length - 1 : firstInvalidStepIndex;
  const currentStepValidation =
    stepValidations[stepIndex] ??
    stepValidations[0] ?? {
      valid: true,
      fieldErrors: {},
      summary: null,
    };
  const currentStep = FORM_STEPS[stepIndex] ?? FORM_STEPS[0];
  const currentStepHasErrors = !currentStepValidation.valid;

  const adjustedGroupPlan = useMemo(
    () => (plan ? applyGroupAdjustments(plan.groupPlan, groupAdjustments) : []),
    [plan, groupAdjustments],
  );

  const baseExchangesByGroup = useMemo(() => {
    const index = new Map<string, number>();
    for (const group of plan?.groupPlan ?? []) {
      index.set(String(group.groupCode), Number(group.exchangesPerDay));
    }
    return index;
  }, [plan]);

  const adjustedMacroTotals = useMemo(
    () =>
      adjustedGroupPlan.reduce(
        (totals, group) => ({
          choG: round(totals.choG + group.choG),
          proG: round(totals.proG + group.proG),
          fatG: round(totals.fatG + group.fatG),
          kcal: round(totals.kcal + group.kcal, 0),
        }),
        { choG: 0, proG: 0, fatG: 0, kcal: 0 },
      ),
    [adjustedGroupPlan],
  );

  const groupScoreBias = useMemo(() => {
    const biasMap: Record<string, number> = {};

    for (const group of adjustedGroupPlan) {
      const key = String(group.groupCode);
      const baseExchanges = baseExchangesByGroup.get(key) ?? 0;
      const deltaExchanges = roundHalfSigned(group.exchangesPerDay - baseExchanges);
      if (deltaExchanges === 0) continue;
      biasMap[key] = round(deltaExchanges * 4);
    }

    return biasMap;
  }, [adjustedGroupPlan, baseExchangesByGroup]);

  const adjustedExtendedFoods = useMemo(() => {
    if (!plan) return [] as RankedFoodItem[];

    return plan.extendedFoods
      .map((food) => {
        const key = String(food.subgroupCode ?? food.groupCode);
        const bias = groupScoreBias[key] ?? 0;
        if (!bias) return food;

        return {
          ...food,
          score: round(food.score + bias),
          reasons: [
            ...food.reasons,
            {
              code: 'group_match' as const,
              label: 'Ajuste dinamico por equivalentes del grupo',
              impact: bias,
            },
          ],
        };
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }, [plan, groupScoreBias]);

  const adjustedTopFoodsByGroup = useMemo(() => {
    if (!plan) return {} as Record<string, RankedFoodItem[]>;

    const grouped = groupTopFoods(adjustedExtendedFoods, 6);
    for (const group of adjustedGroupPlan) {
      const key = String(group.groupCode);
      if (!grouped[key]) {
        grouped[key] = (plan.topFoodsByGroup[key] ?? []).slice(0, 6);
      }
    }
    return grouped;
  }, [adjustedExtendedFoods, adjustedGroupPlan, plan]);

  // Reactive meal distribution — recomputes when group adjustments change
  const adjustedMealDistribution = useMemo(() => {
    if (!plan) return [];
    return distributeMeals(adjustedGroupPlan, plan.profile);
  }, [adjustedGroupPlan, plan]);

  const onProfileChange = <K extends keyof PatientProfile>(
    field: K,
    value: PatientProfile[K],
  ): void => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const onCsvChange = (field: keyof CsvInputs, value: string): void => {
    setCsvInputs((prev) => ({ ...prev, [field]: value }));
  };

  const onCountryChange = (countryCode: PatientProfile['countryCode']): void => {
    setProfile((prev) => ({
      ...prev,
      countryCode,
      stateCode: getDefaultState(options, countryCode),
      systemId: getDefaultSystem(options, countryCode) as PatientProfile['systemId'],
    }));
  };

  const onGoalChange = (goal: PatientProfile['goal']): void => {
    const settings = WEEKLY_GOAL_SETTINGS[goal];
    setProfile((prev) => ({
      ...prev,
      goal,
      goalDeltaKgPerWeek:
        goal === 'maintain'
          ? 0
          : clampWeeklyGoalDelta(goal, prev.goalDeltaKgPerWeek || settings.recommended),
    }));
  };

  const onGoalDeltaChange = (nextValue: number): void => {
    setProfile((prev) => ({
      ...prev,
      goalDeltaKgPerWeek: clampWeeklyGoalDelta(prev.goal, nextValue),
    }));
  };

  const handleStepSelect = (targetIndex: number): void => {
    const bounded = clamp(targetIndex, 0, FORM_STEPS.length - 1);
    if (bounded <= stepIndex) {
      setStepIndex(bounded);
      return;
    }

    if (bounded <= maxReachableStep) {
      setStepIndex(bounded);
      return;
    }

    setStepIndex(maxReachableStep);
  };

  const handleBackStep = (): void => {
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleNextStep = (): void => {
    if (!currentStepValidation.valid) return;
    setStepIndex((prev) => Math.min(prev + 1, FORM_STEPS.length - 1));
  };

  const adjustGroupExchanges = (groupCode: string, step: number): void => {
    if (!plan) return;

    const base = baseExchangesByGroup.get(groupCode) ?? 0;
    setGroupAdjustments((prev) => {
      const currentDelta = prev[groupCode] ?? 0;
      const currentExchanges = roundHalf(base + currentDelta);
      const nextExchanges = roundHalf(clamp(currentExchanges + step, 0, MAX_DYNAMIC_EXCHANGES));
      const nextDelta = roundHalfSigned(nextExchanges - base);

      // Build new adjustments with the modified group
      const next: Record<string, number> = { ...prev };
      if (nextDelta === 0) {
        delete next[groupCode];
      } else {
        next[groupCode] = nextDelta;
      }

      // --- Smart rebalancing ---
      // Compute kcal change caused by this group adjustment
      const groupDef = plan.groupPlan.find((g) => String(g.groupCode) === groupCode);
      if (!groupDef) return next;

      const baseGroupExchanges = Number(groupDef.exchangesPerDay);
      const kcalPerExchange = baseGroupExchanges > 0 ? groupDef.kcal / baseGroupExchanges : 0;
      const kcalDelta = (nextExchanges - baseGroupExchanges) * kcalPerExchange;

      // Only rebalance if kcal shift is meaningful (>10 kcal)
      if (Math.abs(kcalDelta) < 10) return next;

      // Collect eligible groups for rebalancing
      const eligible = plan.groupPlan.filter((g) => {
        const code = String(g.groupCode);
        return code !== groupCode && !NON_REBALANCE_GROUPS.has(code) && g.exchangesPerDay > 0;
      });

      const totalEligibleKcal = eligible.reduce((sum, g) => sum + g.kcal, 0);
      if (totalEligibleKcal <= 0) return next;

      // Distribute the inverse kcal delta proportionally
      for (const eg of eligible) {
        const egCode = String(eg.groupCode);
        const egBase = Number(eg.exchangesPerDay);
        const egKcalPerEx = egBase > 0 ? eg.kcal / egBase : 0;
        if (egKcalPerEx <= 0) continue;

        const share = eg.kcal / totalEligibleKcal;
        const compensationKcal = -kcalDelta * share;
        const compensationExchanges = roundHalfSigned(compensationKcal / egKcalPerEx);

        const existingDelta = next[egCode] ?? 0;
        const egCurrentExchanges = roundHalf(egBase + existingDelta);
        const egNextExchanges = roundHalf(
          clamp(egCurrentExchanges + compensationExchanges, 0, MAX_DYNAMIC_EXCHANGES),
        );
        const egNewDelta = roundHalfSigned(egNextExchanges - egBase);

        if (egNewDelta === 0) {
          delete next[egCode];
        } else {
          next[egCode] = egNewDelta;
        }
      }

      return next;
    });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!allStepsValid) {
      setStepIndex(maxReachableStep);
      return;
    }

    const normalizedProfile: PatientProfile = {
      ...profile,
      goalDeltaKgPerWeek: clampWeeklyGoalDelta(profile.goal, profile.goalDeltaKgPerWeek),
      allergies: parseCsvText(csvInputs.allergiesText),
      intolerances: parseCsvText(csvInputs.intolerancesText),
      likes: parseCsvText(csvInputs.likesText),
      dislikes: parseCsvText(csvInputs.dislikesText),
    };

    setViewPhase('generating');
    setError(null);

    try {
      const generated = await generatePlan(cid, normalizedProfile);
      setPlan(generated);
      setGroupAdjustments({});
      setProfile(normalizedProfile);
      setViewPhase('result');

      void postEvent({
        cid,
        event: 'generate',
        meta: {
          source,
          identityMode,
          manychatEligible,
          attribution,
          countryCode: normalizedProfile.countryCode,
          stateCode: normalizedProfile.stateCode,
          systemId: normalizedProfile.systemId,
          formulaId: normalizedProfile.formulaId,
          profile: {
            goal: normalizedProfile.goal,
            goalDeltaKgPerWeek: normalizedProfile.goalDeltaKgPerWeek,
            activityLevel: normalizedProfile.activityLevel,
            mealsPerDay: normalizedProfile.mealsPerDay,
          },
        },
      }).catch(() => {
        // fail-soft tracking
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando plan');
      setViewPhase('form');
      setStepIndex(FORM_STEPS.length - 1);
    }
  };

  const trackExport = (formats: string[], itemsCount: number): void => {
    if (!cid) return;
    void postEvent({
      cid,
      event: 'export',
      meta: {
        source,
        identityMode,
        attribution,
        formats,
        itemsCount,
      },
    }).catch(() => {
      // fail-soft tracking
    });
  };

  const handleLeadSuccess = async (): Promise<void> => {
    setIsLeadModalOpen(false);
    if (pendingAction) {
      await pendingAction();
      setPendingAction(null);
    }
  };

  const exportEquivalentListExcelFile = async (): Promise<void> => {
    if (!cid || !plan) return;

    const execute = async () => {
      const generatedAt = new Date();
      await downloadEquivalentListExcel({
        cid,
        generatedAt,
        groupPlan: adjustedGroupPlan,
        foods: adjustedExtendedFoods,
      });
      trackExport(['excel_equivalents_list'], adjustedExtendedFoods.length);
    };

    if (isGuest) {
      setPendingAction(() => execute);
      setIsLeadModalOpen(true);
      return;
    }

    await execute();
  };
  if (!cid || !plan) return;

  const generatedAt = new Date();
  await downloadEquivalentListExcel({
    cid,
    generatedAt,
    groupPlan: adjustedGroupPlan,
    foods: adjustedExtendedFoods,
  });
  trackExport(['excel_equivalents_list'], adjustedExtendedFoods.length);
};

const exportClinicalPdf = async (): Promise<void> => {
  if (!cid || !plan) return;

  const execute = async () => {
    const generatedAt = new Date();
    await downloadClinicalPdf({
      cid,
      generatedAt,
      profile,
      targets: plan.targets,
      adjustedMacroTotals,
      adjustedGroupPlan,
      adjustedTopFoodsByGroup,
      adjustedExtendedFoods,
    });
    const foodsCount = Math.min(adjustedExtendedFoods.length, PDF_EXTENDED_FOODS_LIMIT);
    trackExport(['pdf_clinical_report'], adjustedGroupPlan.length + foodsCount);
  };

  if (isGuest) {
    setPendingAction(() => execute);
    setIsLeadModalOpen(true);
    return;
  }

  await execute();
};
if (!cid || !plan) return;

const generatedAt = new Date();
await downloadClinicalPdf({
  cid,
  generatedAt,
  profile,
  targets: plan.targets,
  adjustedMacroTotals,
  adjustedGroupPlan,
  adjustedTopFoodsByGroup,
  adjustedExtendedFoods,
});
const foodsCount = Math.min(adjustedExtendedFoods.length, PDF_EXTENDED_FOODS_LIMIT);
trackExport(['pdf_clinical_report'], adjustedGroupPlan.length + foodsCount);
  };

const completedMap = FORM_STEPS.map(
  (_, index) => index < stepIndex && (stepValidations[index]?.valid ?? false),
);

const renderCurrentStep = (): JSX.Element => {
  switch (stepIndex) {
    case 0:
      return (
        <StepGoal
          profile={profile}
          weeklyGoalSetting={WEEKLY_GOAL_SETTINGS[profile.goal]}
          formulas={formulaOptions}
          showErrors={currentStepHasErrors}
          errors={currentStepValidation.fieldErrors}
          onGoalChange={onGoalChange}
          onGoalDeltaChange={onGoalDeltaChange}
          onFormulaChange={(formulaId) => onProfileChange('formulaId', formulaId)}
        />
      );
    case 1:
      return (
        <StepAnthropometry
          profile={profile}
          showErrors={currentStepHasErrors}
          errors={currentStepValidation.fieldErrors}
          onProfileChange={onProfileChange}
        />
      );
    case 2:
      return (
        <StepRegion
          profile={profile}
          countries={countryOptions}
          states={stateOptions}
          systems={systemOptions}
          showErrors={currentStepHasErrors}
          errors={currentStepValidation.fieldErrors}
          onCountryChange={onCountryChange}
          onStateChange={(stateCode) => onProfileChange('stateCode', stateCode)}
          onSystemChange={(systemId) => onProfileChange('systemId', systemId)}
        />
      );
    case 3:
      return (
        <StepHabits
          profile={profile}
          csvInputs={{
            likesText: csvInputs.likesText,
            dislikesText: csvInputs.dislikesText,
          }}
          showErrors={currentStepHasErrors}
          errors={currentStepValidation.fieldErrors}
          onProfileChange={onProfileChange}
          onCsvChange={(field, value) => onCsvChange(field, value)}
        />
      );
    default:
      return (
        <StepReview
          profile={profile}
          csvInputs={csvInputs}
          onCsvChange={(field, value) => onCsvChange(field, value)}
          onGoToStep={(targetIndex) => handleStepSelect(targetIndex)}
        />
      );
  }
};

const handleEditPlan = (): void => {
  setViewPhase('form');
  setStepIndex(FORM_STEPS.length - 1);
};

return (
  <div className="space-y-6">
    {viewPhase === 'form' ? (
      <section className="animate-fade-in rounded-[2rem] border border-sky/15 bg-gradient-to-br from-white/90 via-white/80 to-sky-50/60 p-6 shadow-[0_16px_48px_rgba(24,47,80,0.08)] backdrop-blur-xl md:p-8 lg:p-10">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div className="space-y-8">
            <div className="animate-slide-up">
              <span className="inline-block rounded-full bg-sky/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-sky">
                Nutricion inteligente
              </span>
              <h2 className="mt-3 text-3xl font-extrabold leading-tight text-ink md:text-4xl">
                Genera planes alimenticios{' '}
                <span className="bg-gradient-to-r from-[#0f8bff] to-[#2e86c1] bg-clip-text text-transparent">
                  personalizados
                </span>
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                Calculadora dinamica basada en sistemas de equivalentes. Ingresa el
                perfil del paciente y obten un plan completo con distribucion de
                macros, grupos de alimentos y recomendaciones personalizadas.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="group flex gap-3 rounded-2xl border border-sky/10 bg-white/60 p-3.5 shadow-sm transition-all duration-300 hover:border-sky/30 hover:bg-white hover:shadow-md"
                >
                  <FeatureIcon d={feature.icon} color={feature.color} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink">{feature.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      {feature.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden h-[460px] lg:block">
            <HeroIllustration />
          </div>
        </div>
      </section>
    ) : null}

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {viewPhase === 'form' ? (
        <section className="lg:col-span-2 rounded-[1.8rem] border border-sky/12 bg-white/85 p-5 shadow-[0_16px_40px_rgba(24,47,80,0.1)] backdrop-blur-xl md:p-6">
          <div className="mb-5">
            <div
              className={
                isGuest
                  ? 'mb-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-900'
                  : 'mb-3 rounded-xl border border-sky/20 bg-sky-50/60 px-3 py-2 text-xs font-semibold text-sky-900'
              }
            >
              {isGuest ? 'Invitado' : 'Acceso desde enlace personal de WhatsApp.'}
            </div>

            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky">
              Tracking activo
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-ink md:text-2xl">
              Generador dinamico de equivalentes
            </h2>
            <p className="mt-1 text-xs text-slate-500">Identidad activa: {cid}</p>
          </div>

          <StepperHeader
            steps={FORM_STEPS}
            activeStep={stepIndex}
            maxReachableStep={maxReachableStep}
            completedMap={completedMap}
            onSelectStep={handleStepSelect}
          />

          <form className="mt-4 grid gap-4" onSubmit={submit}>
            <StepContainer
              title={currentStep.title}
              description={currentStep.description}
              errorSummary={currentStepHasErrors ? currentStepValidation.summary : null}
            >
              {renderCurrentStep()}
            </StepContainer>

            <StepperActions
              stepIndex={stepIndex}
              totalSteps={FORM_STEPS.length}
              canProceed={currentStepValidation.valid}
              allStepsValid={allStepsValid}
              loading={isGenerating}
              onBack={handleBackStep}
              onNext={handleNextStep}
            />
          </form>

          {error ? (
            <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {viewPhase === 'result' && plan ? (
        <section className="lg:col-span-2 rounded-[1.8rem] border border-sky/12 bg-white/85 p-5 shadow-[0_16px_40px_rgba(24,47,80,0.1)] backdrop-blur-xl md:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky">
                Plan generado
              </p>
              <h2 className="mt-1 text-xl font-extrabold text-ink md:text-2xl">
                Resultado de equivalentes
              </h2>
              <p className="mt-1 text-xs text-slate-500">Identidad activa: {cid}</p>
            </div>
            <button
              className="no-print rounded-xl border border-sky/35 bg-white px-4 py-2.5 text-sm font-semibold text-sky transition hover:border-sky hover:bg-sky-50"
              onClick={handleEditPlan}
              type="button"
            >
              Editar formulario
            </button>
          </div>

          <div className="animate-fade-in space-y-5">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_360px]">
              <div className="grid gap-3 sm:grid-cols-2">
                <article className="rounded-2xl border border-sky/12 bg-gradient-to-br from-cloud to-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Kcal objetivo
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-ink">
                    {adjustedMacroTotals.kcal}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Referencia inicial: {plan.targets.targetCalories} kcal
                  </p>
                </article>
                <article className="rounded-2xl border border-sky/12 bg-gradient-to-br from-cloud to-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Carbohidratos
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-ink">
                    {adjustedMacroTotals.choG} g
                  </p>
                </article>
                <article className="rounded-2xl border border-sky/12 bg-gradient-to-br from-cloud to-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Proteina
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-ink">
                    {adjustedMacroTotals.proG} g
                  </p>
                </article>
                <article className="rounded-2xl border border-sky/12 bg-gradient-to-br from-cloud to-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Grasa
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-ink">
                    {adjustedMacroTotals.fatG} g
                  </p>
                </article>
              </div>
              <MacroPieChart
                caloriesKcal={adjustedMacroTotals.kcal}
                carbsG={adjustedMacroTotals.choG}
                fatG={adjustedMacroTotals.fatG}
                proteinG={adjustedMacroTotals.proG}
              />
            </div>

            <div className="no-print flex flex-wrap gap-2">
              <button
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-[0_6px_18px_rgba(46,134,193,0.3)] transition hover:brightness-105 hover:shadow-[0_8px_22px_rgba(46,134,193,0.42)]"
                style={{
                  background:
                    'linear-gradient(90deg, #0f8bff 0%, #2e86c1 100%)',
                }}
                onClick={() => void exportEquivalentListExcelFile()}
                type="button"
              >
                Descargar lista de equivalentes (Excel)
              </button>
              <button
                className="rounded-xl border border-sky/40 bg-white px-4 py-2.5 text-sm font-bold text-ink transition hover:border-sky/60 hover:shadow-[0_4px_12px_rgba(103,182,223,0.12)]"
                onClick={() => void exportClinicalPdf()}
                type="button"
              >
                Descargar PDF clinico
              </button>
              <button
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                onClick={() => setGroupAdjustments({})}
                type="button"
              >
                Restablecer equivalentes
              </button>
            </div>

            {adjustedMealDistribution.length > 0 && (
              <MealDistributionTable
                mealDistribution={adjustedMealDistribution}
                groupPlan={adjustedGroupPlan}
              />
            )}

            <p className="text-xs text-slate-500">
              Ajusta equivalentes con +/- por grupo. La distribucion de macros y la lista
              de alimentos se actualizan en tiempo real.
            </p>
            <div className="overflow-x-auto rounded-2xl border border-sky/12 bg-white">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-sky/10 bg-gradient-to-r from-sky-50/60 to-white text-left">
                    <th className="py-3 pl-4 pr-3 font-bold text-ink">Grupo</th>
                    <th className="py-3 pr-3 font-bold text-ink">Equiv./dia</th>
                    <th className="py-3 pr-3 font-bold text-ink">Ajuste</th>
                    <th className="py-3 pr-3 font-bold text-ink">Macros</th>
                    <th className="py-3 pr-4 font-bold text-ink">Top alimentos</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustedGroupPlan.map((group) => {
                    const groupKey = String(group.groupCode);
                    const hasBaseExchanges =
                      (baseExchangesByGroup.get(groupKey) ?? 0) > 0;
                    const topFoods = (adjustedTopFoodsByGroup[groupKey] ?? []).slice(0, 6);
                    return (
                      <tr
                        key={group.groupCode}
                        className="border-b border-sky/6 align-top transition hover:bg-sky-50/30"
                      >
                        <td className="py-3 pl-4 pr-3 font-semibold text-ink">
                          {group.groupName}
                        </td>
                        <td className="py-3 pr-3 tabular-nums">{group.exchangesPerDay}</td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              className="h-7 w-7 rounded-lg border border-sky/25 bg-white text-sm font-bold text-sky transition hover:border-sky hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={group.exchangesPerDay <= 0}
                              onClick={() => adjustGroupExchanges(groupKey, -0.5)}
                              type="button"
                            >
                              -
                            </button>
                            <button
                              className="h-7 w-7 rounded-lg border border-sky/25 bg-white text-sm font-bold text-sky transition hover:border-sky hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={!hasBaseExchanges}
                              onClick={() => adjustGroupExchanges(groupKey, 0.5)}
                              type="button"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-xs text-slate-600">
                          CHO {group.choG}g / PRO {group.proG}g / FAT {group.fatG}g
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-700">
                          {topFoods.length > 0
                            ? topFoods.map((food) => food.name).join(', ')
                            : 'Sin recomendaciones aun'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-extrabold text-ink">
                Lista extensa personalizada
              </h3>
              <div className="max-h-[420px] overflow-y-auto rounded-xl border border-sky/12 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-gradient-to-r from-sky-50/80 to-white/90 backdrop-blur-sm">
                    <tr className="border-b border-sky/10 text-left">
                      <th className="px-4 py-2.5 font-bold text-ink">Alimento</th>
                      <th className="px-3 py-2.5 font-bold text-ink">Grupo</th>
                      <th className="px-3 py-2.5 font-bold text-ink">Score</th>
                      <th className="px-4 py-2.5 font-bold text-ink">Razones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustedExtendedFoods.map((food) => (
                      <tr
                        key={food.id}
                        className="border-b border-sky/6 align-top transition hover:bg-sky-50/30"
                      >
                        <td className="px-4 py-2 font-medium text-ink">{food.name}</td>
                        <td className="px-3 py-2">{food.subgroupCode ?? food.groupCode}</td>
                        <td className="px-3 py-2 tabular-nums">{food.score}</td>
                        <td className="px-4 py-2 text-xs text-slate-600">
                          {(food.reasons ?? [])
                            .slice(0, 3)
                            .map((reason) => reason.label)
                            .join(' | ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>

    {isGenerating ? (
      <BootSplash variant="generate" message="Generando plan personalizado..." />
    ) : null}
    <LeadCaptureModal
      isOpen={isLeadModalOpen}
      onClose={() => setIsLeadModalOpen(false)}
      onSuccess={handleLeadSuccess}
    />
  </div>
);
};
