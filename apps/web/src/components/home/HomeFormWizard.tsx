import { type KcalFormulaId, type PatientProfile } from '@equivalentes/shared';

import { StepContainer } from '../form/StepContainer';
import { StepperActions } from '../form/StepperActions';
import { StepperHeader } from '../form/StepperHeader';
import { StepAnthropometry } from '../form/steps/StepAnthropometry';
import { StepGoal } from '../form/steps/StepGoal';
import { StepHabits } from '../form/steps/StepHabits';
import { StepClinicalProfile } from '../form/steps/StepClinicalProfile';
import { StepRegion } from '../form/steps/StepRegion';
import { StepReview } from '../form/steps/StepReview';
import { WEEKLY_GOAL_SETTINGS } from '../form/validators';
import { CsvInputs, FORM_STEPS } from './constants';

export type ValidationSummary = {
    valid: boolean;
    fieldErrors: Record<string, string>;
    summary: string | null;
};

interface HomeFormWizardProps {
    isGuest: boolean;
    cid?: string;
    stepIndex: number;
    maxReachableStep: number;
    completedMap: boolean[];
    currentStepValidation: ValidationSummary;
    allStepsValid: boolean;
    isGenerating: boolean;
    error: string | null;
    profile: PatientProfile;
    csvInputs: CsvInputs;
    countryOptions: { code: string; name: string }[];
    stateOptions: { code: string; name: string }[];
    systemOptions: { id: string; name: string }[];
    formulaOptions: { id: KcalFormulaId; name: string; description: string }[];
    onStepSelect: (index: number) => void;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    onBack: () => void;
    onNext: () => void;
    onProfileChange: <K extends keyof PatientProfile>(field: K, value: PatientProfile[K]) => void;
    onCountryChange: (countryCode: PatientProfile['countryCode']) => void;
    onGoalChange: (goal: PatientProfile['goal']) => void;
    onGoalDeltaChange: (value: number) => void;
    onCsvChange: (field: keyof CsvInputs, value: string) => void;
}

export const HomeFormWizard = ({
    isGuest,
    cid,
    stepIndex,
    maxReachableStep,
    completedMap,
    currentStepValidation,
    allStepsValid,
    isGenerating,
    error,
    profile,
    csvInputs,
    countryOptions,
    stateOptions,
    systemOptions,
    formulaOptions,
    onStepSelect,
    onSubmit,
    onBack,
    onNext,
    onProfileChange,
    onCountryChange,
    onGoalChange,
    onGoalDeltaChange,
    onCsvChange,
}: HomeFormWizardProps): JSX.Element => {
    const currentStep = FORM_STEPS[stepIndex] ?? FORM_STEPS[0];
    const currentStepHasErrors = !currentStepValidation.valid;

    const renderCurrentStep = (): JSX.Element => {
        switch (stepIndex) {
            case 0:
                return (
                    <StepGoal
                        profile={profile}
                        weeklyGoalSetting={WEEKLY_GOAL_SETTINGS[profile.goal] ?? WEEKLY_GOAL_SETTINGS['maintain']}
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
            case 4:
                return (
                    <StepClinicalProfile
                        profile={profile}
                        showErrors={currentStepHasErrors}
                        errors={currentStepValidation.fieldErrors}
                        onProfileChange={onProfileChange}
                    />
                );
            default:
                return (
                    <StepReview
                        profile={profile}
                        csvInputs={csvInputs}
                        onCsvChange={(field, value) => onCsvChange(field, value)}
                        onGoToStep={(targetIndex) => onStepSelect(targetIndex)}
                    />
                );
        }
    };

    return (
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

                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky">Tracking activo</p>
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
                onSelectStep={onStepSelect}
            />

            <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
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
                    onBack={onBack}
                    onNext={onNext}
                />
            </form>

            {error ? (
                <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    {error}
                </p>
            ) : null}
        </section>
    );
};
