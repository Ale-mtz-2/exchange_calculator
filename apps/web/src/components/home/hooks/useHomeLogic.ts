import {
    COUNTRY_OPTIONS,
    COUNTRY_STATES,
    EXCHANGE_SYSTEMS,
    KCAL_FORMULAS,
    distributeMeals,
    type EquivalentBucketPlanV2,
    type EquivalentPlanResponseV2,
    type PatientProfile,
    type RankedFoodItemV2,
} from '@equivalentes/shared';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import {
    WEEKLY_GOAL_SETTINGS,
    clampWeeklyGoalDelta,
    getFirstInvalidStepIndex,
    validateAnthropometryStep,
    validateClinicalStep,
    validateGoalStep,
    validateHabitsStep,
    validateRegionStep,
    validateReviewStep,
} from '../../form/validators';
import {
    generatePlan,
    getLeadByCid,
    getOptions,
    postEvent,
    upsertLeadByCid,
    type AppOptions,
    type LeadByCidPayload,
} from '../../../lib/api';
import { resolveTrackingIdentity } from '../../../lib/trackingIdentity';
import {
    buildBaseExchangesByBucket,
    buildEditableBucketRows,
    buildEffectiveEditableBucketRows,
    canIncrease,
    isNonRebalanceBucket,
    roundHalf,
    roundHalfSigned,
} from '../../../lib/bucketPlanDynamic';
import { buildBucketLabelIndex, resolveFoodBucketLabel } from '../../../lib/bucketLabels';
import {
    applyMealCellStep,
    filterRebalanceCandidates,
    mergeMealOverrides,
    normalizeBucketMealRow,
    type MealCellOverridesByBucket,
} from '../../../lib/mealCellAdjustments';
import {
    hasLeadPromptBeenHandled,
    markLeadPromptCompleted,
    markLeadPromptDismissed,
} from '../../../lib/leadCaptureState';
import { downloadEquivalentListExcel } from '../../../lib/exportEquivalentListExcel';
import { downloadClinicalPdf, PDF_EXTENDED_FOODS_LIMIT } from '../../../lib/pdfClinicalReport';
import {
    defaultProfile,
    MAX_DYNAMIC_EXCHANGES,
    FORM_STEPS,
    round,
    clamp,
    getDefaultState,
    getDefaultSystem,
    parseCsvText,
    type CsvInputs,
    type ViewPhase,
} from '../constants';
import { ValidationSummary } from '../HomeFormWizard';

export function useHomeLogic() {
    const location = useLocation();
    const [trackingIdentity, setTrackingIdentity] = useState(() => resolveTrackingIdentity(location.search));
    const { cid, source, identityMode, isGuest, manychatEligible, attribution } = trackingIdentity;

    useEffect(() => {
        setTrackingIdentity(resolveTrackingIdentity(location.search));
    }, [location.search]);

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
    const [plan, setPlan] = useState<EquivalentPlanResponseV2 | null>(null);
    const [bucketAdjustments, setBucketAdjustments] = useState<Record<string, number>>({});
    const [mealCellOverridesByBucket, setMealCellOverridesByBucket] = useState<MealCellOverridesByBucket>({});
    const [lastEditedMealByBucket, setLastEditedMealByBucket] = useState<Record<string, string>>({});
    const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
    const [leadByCid, setLeadByCid] = useState<LeadByCidPayload | null>(null);
    const [isLeadLookupDone, setIsLeadLookupDone] = useState(false);
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
        let cancelled = false;

        if (!cid) {
            setLeadByCid(null);
            setIsLeadLookupDone(true);
            return;
        }

        setIsLeadLookupDone(false);

        void getLeadByCid(cid)
            .then((lead) => {
                if (cancelled) return;
                setLeadByCid(lead);
                setProfile((prev) => ({
                    ...prev,
                    fullName: lead.fullName || prev.fullName,
                    birthDate: lead.birthDate ?? prev.birthDate,
                    waistCm: lead.waistCm ?? prev.waistCm,
                    hasDiabetes: lead.hasDiabetes,
                    hasHypertension: lead.hasHypertension,
                    hasDyslipidemia: lead.hasDyslipidemia,
                    trainingWindow: lead.trainingWindow,
                    usesDairyInSnacks: lead.usesDairyInSnacks,
                }));
            })
            .catch(() => {
                if (cancelled) return;
                setLeadByCid(null);
            })
            .finally(() => {
                if (cancelled) return;
                setIsLeadLookupDone(true);
            });

        return () => {
            cancelled = true;
        };
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
            validateClinicalStep(profile, {
                requireFullName: isGuest && isLeadLookupDone && !leadByCid?.fullName?.trim(),
            }),
            validateReviewStep(),
        ],
        [isGuest, isLeadLookupDone, leadByCid?.fullName, profile, stateOptions, systemOptions],
    );

    const firstInvalidStepIndex = getFirstInvalidStepIndex(stepValidations);
    const allStepsValid = firstInvalidStepIndex === -1;
    const maxReachableStep =
        firstInvalidStepIndex === -1 ? FORM_STEPS.length - 1 : firstInvalidStepIndex;

    const currentStepValidation: ValidationSummary =
        stepValidations[stepIndex] ??
        stepValidations[0] ?? {
            valid: true,
            fieldErrors: {},
            summary: null,
        };

    const completedMap = FORM_STEPS.map(
        (_, index) => index < stepIndex && (stepValidations[index]?.valid ?? false),
    );

    const editableBucketRows = useMemo(
        () => (plan ? buildEditableBucketRows(plan.bucketCatalog, plan.bucketPlan, bucketAdjustments) : []),
        [plan, bucketAdjustments],
    );

    const effectiveEditableBucketRows = useMemo(
        () => buildEffectiveEditableBucketRows(editableBucketRows),
        [editableBucketRows],
    );

    const adjustedBucketPlan = useMemo<EquivalentBucketPlanV2[]>(
        () =>
            effectiveEditableBucketRows.map((bucket) => ({
                bucketType: bucket.bucketType,
                bucketId: bucket.bucketId,
                bucketKey: bucket.bucketKey,
                bucketName: bucket.bucketName,
                ...(bucket.legacyCode ? { legacyCode: bucket.legacyCode } : {}),
                exchangesPerDay: bucket.exchangesPerDay,
                choG: bucket.choG,
                proG: bucket.proG,
                fatG: bucket.fatG,
                kcal: bucket.kcal,
            })),
        [effectiveEditableBucketRows],
    );

    const baseExchangesByBucket = useMemo(
        () => buildBaseExchangesByBucket(effectiveEditableBucketRows),
        [effectiveEditableBucketRows],
    );

    const bucketLabelIndex = useMemo(
        () => (plan ? buildBucketLabelIndex(plan.bucketCatalog) : new Map()),
        [plan],
    );

    const adjustedMacroTotals = useMemo(
        () =>
            effectiveEditableBucketRows.reduce(
                (totals, bucket) => ({
                    choG: round(totals.choG + bucket.choG),
                    proG: round(totals.proG + bucket.proG),
                    fatG: round(totals.fatG + bucket.fatG),
                    kcal: round(totals.kcal + bucket.kcal, 0),
                }),
                { choG: 0, proG: 0, fatG: 0, kcal: 0 },
            ),
        [effectiveEditableBucketRows],
    );

    const adjustedExtendedFoods = useMemo(() => {
        if (!plan) return [] as RankedFoodItemV2[];
        return plan.extendedFoods;
    }, [plan]);

    const adjustedTopFoodsByBucket = useMemo(() => {
        if (!plan) return {} as Record<string, RankedFoodItemV2[]>;
        return plan.topFoodsByBucket;
    }, [plan]);

    const baselineMealDistribution = useMemo(() => {
        if (!plan) return [];
        return distributeMeals(
            effectiveEditableBucketRows.map((bucket) => ({
                bucketKey: bucket.bucketKey,
                ...(bucket.legacyCode ? { legacyCode: bucket.legacyCode } : {}),
                bucketType: bucket.bucketType,
                bucketId: bucket.bucketId,
                ...(typeof bucket.parentGroupId === 'number' ? { parentGroupId: bucket.parentGroupId } : {}),
                exchangesPerDay: bucket.exchangesPerDay,
            })),
            plan.profile,
        );
    }, [effectiveEditableBucketRows, plan]);

    const adjustedMealDistribution = useMemo(() => {
        if (!plan) return [];
        if (baselineMealDistribution.length === 0) return baselineMealDistribution;

        const mealOrder = baselineMealDistribution.map((slot) => slot.name);
        const slots = baselineMealDistribution.map((slot) => ({
            ...slot,
            distribution: { ...slot.distribution },
        }));
        const slotByName = new Map(slots.map((slot) => [slot.name, slot]));
        const bucketByKey = new Map(
            adjustedBucketPlan.map((bucket) => [bucket.bucketKey, bucket]),
        );

        for (const [bucketKey, overrideRow] of Object.entries(mealCellOverridesByBucket)) {
            const bucket = bucketByKey.get(bucketKey);
            if (!bucket) continue;

            const preferredMeal = lastEditedMealByBucket[bucketKey] ?? mealOrder[0] ?? '';
            const normalizedRow = normalizeBucketMealRow(
                overrideRow,
                bucket.exchangesPerDay,
                preferredMeal,
                mealOrder,
            );

            for (const mealName of mealOrder) {
                const slot = slotByName.get(mealName);
                if (!slot) continue;
                slot.distribution[bucketKey] = normalizedRow[mealName] ?? 0;
            }
        }

        return slots;
    }, [
        adjustedBucketPlan,
        baselineMealDistribution,
        lastEditedMealByBucket,
        mealCellOverridesByBucket,
        plan,
    ]);

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

    const applyBucketExchangeStep = (
        previousAdjustments: Record<string, number>,
        bucketKey: string,
        step: number,
        lockedBucketKeys: ReadonlySet<string> = new Set(),
    ): Record<string, number> => {
        if (!plan) return previousAdjustments;

        const base = baseExchangesByBucket.get(bucketKey) ?? 0;
        const currentDelta = previousAdjustments[bucketKey] ?? 0;
        const currentExchanges = roundHalf(base + currentDelta);
        const nextExchanges = roundHalf(clamp(currentExchanges + step, 0, MAX_DYNAMIC_EXCHANGES));
        const nextDelta = roundHalfSigned(nextExchanges - base);

        const next: Record<string, number> = { ...previousAdjustments };
        if (nextDelta === 0) {
            delete next[bucketKey];
        } else {
            next[bucketKey] = nextDelta;
        }

        const beforeRows = buildEffectiveEditableBucketRows(
            buildEditableBucketRows(plan.bucketCatalog, plan.bucketPlan, previousAdjustments),
        );
        const afterRows = buildEffectiveEditableBucketRows(
            buildEditableBucketRows(plan.bucketCatalog, plan.bucketPlan, next),
        );
        const effectiveBaseExchangesByBucket = buildBaseExchangesByBucket(afterRows);
        const beforeTarget = beforeRows.find((bucket) => bucket.bucketKey === bucketKey);
        const afterTarget = afterRows.find((bucket) => bucket.bucketKey === bucketKey);
        if (!beforeTarget || !afterTarget || afterTarget.kcalPerExchange <= 0) return next;

        const kcalDelta =
            (afterTarget.exchangesPerDay - beforeTarget.exchangesPerDay) * afterTarget.kcalPerExchange;
        if (Math.abs(kcalDelta) < 10) return next;

        const eligible = filterRebalanceCandidates(afterRows, bucketKey, lockedBucketKeys).filter(
            (bucket) =>
                !isNonRebalanceBucket(bucket) &&
                bucket.exchangesPerDay > 0 &&
                bucket.kcalPerExchange > 0,
        );

        const totalEligibleKcal = eligible.reduce((sum, bucket) => sum + bucket.kcal, 0);
        if (totalEligibleKcal <= 0) return next;

        for (const bucket of eligible) {
            const share = bucket.kcal / totalEligibleKcal;
            const compensationKcal = -kcalDelta * share;
            const compensationExchanges = roundHalfSigned(compensationKcal / bucket.kcalPerExchange);

            const rowBase = effectiveBaseExchangesByBucket.get(bucket.bucketKey) ?? 0;
            const existingDelta = next[bucket.bucketKey] ?? 0;
            const rowCurrentExchanges = roundHalf(rowBase + existingDelta);
            const rowNextExchanges = roundHalf(
                clamp(rowCurrentExchanges + compensationExchanges, 0, MAX_DYNAMIC_EXCHANGES),
            );
            const rowNewDelta = roundHalfSigned(rowNextExchanges - rowBase);

            if (rowNewDelta === 0) {
                delete next[bucket.bucketKey];
            } else {
                next[bucket.bucketKey] = rowNewDelta;
            }
        }

        return next;
    };

    const adjustMealCellExchanges = (bucketKey: string, mealName: string, step: number): void => {
        if (!plan) return;

        const mealOrder = adjustedMealDistribution.map((slot) => slot.name);
        if (!mealOrder.includes(mealName)) return;

        const targetBucket = effectiveEditableBucketRows.find((bucket) => bucket.bucketKey === bucketKey);
        if (!targetBucket) return;

        if (step > 0 && !canIncrease(targetBucket)) return;

        const currentRow = mealOrder.reduce<Record<string, number>>((acc, name) => {
            const slot = adjustedMealDistribution.find((entry) => entry.name === name);
            acc[name] = slot?.distribution[bucketKey] ?? 0;
            return acc;
        }, {});

        const currentCell = currentRow[mealName] ?? 0;
        if (step < 0 && currentCell <= 0) return;

        const currentTotal = targetBucket.exchangesPerDay;
        const nextTotal = roundHalf(clamp(currentTotal + step, 0, MAX_DYNAMIC_EXCHANGES));
        const actualStep = roundHalfSigned(nextTotal - currentTotal);
        if (actualStep === 0) return;

        const nextRow = applyMealCellStep(
            currentRow,
            mealName,
            actualStep,
            nextTotal,
            mealOrder,
        );
        const lockedBucketKeys = new Set(
            Object.keys(mealCellOverridesByBucket).filter((key) => key !== bucketKey),
        );

        setBucketAdjustments((prev) =>
            applyBucketExchangeStep(prev, bucketKey, actualStep, lockedBucketKeys));
        setMealCellOverridesByBucket((prev) =>
            mergeMealOverrides(prev, bucketKey, nextRow, baselineMealDistribution, mealOrder));
        setLastEditedMealByBucket((prev) => ({ ...prev, [bucketKey]: mealName }));
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
            let resolvedLead = leadByCid;

            if (cid) {
                try {
                    resolvedLead = await upsertLeadByCid(cid, {
                        fullName: normalizedProfile.fullName,
                        birthDate: normalizedProfile.birthDate,
                        waistCm: normalizedProfile.waistCm,
                        hasDiabetes: normalizedProfile.hasDiabetes,
                        hasHypertension: normalizedProfile.hasHypertension,
                        hasDyslipidemia: normalizedProfile.hasDyslipidemia,
                        trainingWindow: normalizedProfile.trainingWindow,
                        usesDairyInSnacks: normalizedProfile.usesDairyInSnacks,
                        termsAccepted: leadByCid?.termsAccepted ?? false,
                    });
                    setLeadByCid(resolvedLead);
                } catch {
                    // fail-soft lead upsert
                }
            }

            setPlan(generated);
            setBucketAdjustments({});
            setMealCellOverridesByBucket({});
            setLastEditedMealByBucket({});
            setProfile(normalizedProfile);
            setViewPhase('result');
            const hasContact = Boolean(resolvedLead?.email?.trim() || resolvedLead?.whatsapp?.trim());
            if (cid && !hasLeadPromptBeenHandled(cid) && !hasContact) {
                setIsLeadModalOpen(true);
            }

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

    const handleLeadSuccess = (lead?: LeadByCidPayload): void => {
        if (lead) {
            setLeadByCid(lead);
        } else if (cid) {
            void getLeadByCid(cid)
                .then((resolved) => setLeadByCid(resolved))
                .catch(() => {
                    // fail-soft lead refresh
                });
        }

        if (cid) {
            markLeadPromptCompleted(cid);
        }
        setIsLeadModalOpen(false);
    };

    const handleLeadClose = (): void => {
        if (cid) {
            markLeadPromptDismissed(cid);
        }
        setIsLeadModalOpen(false);
    };

    const exportEquivalentListExcelFile = async (): Promise<void> => {
        if (!cid || !plan) return;

        const generatedAt = new Date();
        await downloadEquivalentListExcel({
            cid,
            generatedAt,
            bucketPlan: adjustedBucketPlan,
            foods: adjustedExtendedFoods,
            resolveBucketLabel: (bucketKey) => bucketLabelIndex.get(bucketKey)?.label ?? bucketKey,
        });

        if (!cid) return;
        void postEvent({
            cid,
            event: 'export',
            meta: {
                source,
                identityMode,
                attribution,
                formats: ['excel_equivalents_list'],
                itemsCount: adjustedExtendedFoods.length,
            },
        }).catch(() => {
            // fail-soft tracking
        });
    };

    const exportClinicalPdf = async (): Promise<void> => {
        if (!cid || !plan) return;

        const generatedAt = new Date();
        await downloadClinicalPdf({
            cid,
            generatedAt,
            profile,
            targets: plan.targets,
            adjustedMacroTotals,
            adjustedBucketPlan,
            adjustedTopFoodsByBucket,
            adjustedExtendedFoods,
            resolveBucketLabel: (bucketKey) => bucketLabelIndex.get(bucketKey)?.label ?? bucketKey,
            resolveFoodBucketLabel: (food) => resolveFoodBucketLabel(food, bucketLabelIndex),
        });

        const foodsCount = Math.min(adjustedExtendedFoods.length, PDF_EXTENDED_FOODS_LIMIT);
        if (!cid) return;
        void postEvent({
            cid,
            event: 'export',
            meta: {
                source,
                identityMode,
                attribution,
                formats: ['pdf_clinical_report'],
                itemsCount: adjustedBucketPlan.length + foodsCount,
            },
        }).catch(() => {
            // fail-soft tracking
        });
    };

    const handleEditPlan = (): void => {
        setViewPhase('form');
        setStepIndex(FORM_STEPS.length - 1);
    };

    const resetBucketAdjustments = (): void => {
        setBucketAdjustments({});
        setMealCellOverridesByBucket({});
        setLastEditedMealByBucket({});
    };

    return {
        state: {
            trackingIdentity,
            isGuest,
            cid,
            stepIndex,
            viewPhase,
            isGenerating,
            error,
            plan,
            isLeadModalOpen,
            leadByCid,
            isLeadLookupDone,
            profile,
            csvInputs,
        },
        form: {
            countryOptions,
            stateOptions,
            systemOptions,
            formulaOptions,
            maxReachableStep,
            completedMap,
            currentStepValidation,
            allStepsValid,
        },
        results: {
            editableBucketRows: effectiveEditableBucketRows,
            adjustedBucketPlan,
            adjustedMacroTotals,
            adjustedExtendedFoods,
            adjustedTopFoodsByBucket,
            adjustedMealDistribution,
            bucketLabelIndex,
        },
        handlers: {
            onProfileChange,
            onCsvChange,
            onCountryChange,
            onGoalChange,
            onGoalDeltaChange,
            handleStepSelect,
            handleBackStep,
            handleNextStep,
            adjustMealCellExchanges,
            submit,
            handleLeadSuccess,
            handleLeadClose,
            exportEquivalentListExcelFile,
            exportClinicalPdf,
            handleEditPlan,
            resetBucketAdjustments,
        },
    };
}
