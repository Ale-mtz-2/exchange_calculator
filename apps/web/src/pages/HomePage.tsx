import { BootSplash } from '../components/BootSplash';
import { LeadCaptureModal } from '../components/LeadCaptureModal';
import { HomeFormWizard } from '../components/home/HomeFormWizard';
import { HomeHero } from '../components/home/HomeHero';
import { HomeResults } from '../components/home/HomeResults';
import { useHomeLogic } from '../components/home/hooks/useHomeLogic';

export const HomePage = (): JSX.Element => {
  const { state, form, results, handlers } = useHomeLogic();

  const {
    isGuest,
    cid,
    stepIndex,
    viewPhase,
    isGenerating,
    error,
    plan,
    isLeadModalOpen,
    leadByCid,
    profile,
    personalPreferences,
    csvInputs,
  } = state;

  const {
    countryOptions,
    stateOptions,
    systemOptions,
    formulaOptions,
    maxReachableStep,
    completedMap,
    currentStepValidation,
    allStepsValid,
  } = form;

  const {
    editableBucketRows,
    adjustedBucketPlan,
    adjustedMacroTotals,
    adjustedExtendedFoods,
    adjustedTopFoodsByBucket,
    adjustedMealDistribution,
    bucketLabelIndex,
  } = results;

  const {
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
    onPersonalPreferenceChange,
    handleLeadSuccess,
    handleLeadClose,
    exportEquivalentListExcelFile,
    exportClinicalPdf,
    handleEditPlan,
    resetBucketAdjustments,
  } = handlers;

  return (
    <div className="space-y-6">
      {viewPhase === 'form' ? <HomeHero /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {viewPhase === 'form' ? (
          <HomeFormWizard
            isGuest={isGuest}
            cid={cid}
            stepIndex={stepIndex}
            maxReachableStep={maxReachableStep}
            completedMap={completedMap}
            currentStepValidation={currentStepValidation}
            allStepsValid={allStepsValid}
            isGenerating={isGenerating}
            error={error}
            profile={profile}
            personalPreferences={personalPreferences}
            csvInputs={csvInputs}
            countryOptions={countryOptions}
            stateOptions={stateOptions}
            systemOptions={systemOptions}
            formulaOptions={formulaOptions}
            onStepSelect={handleStepSelect}
            onSubmit={submit}
            onBack={handleBackStep}
            onNext={handleNextStep}
            onProfileChange={onProfileChange}
            onCountryChange={onCountryChange}
            onGoalChange={onGoalChange}
            onGoalDeltaChange={onGoalDeltaChange}
            onCsvChange={onCsvChange}
            onPersonalPreferenceChange={onPersonalPreferenceChange}
          />
        ) : null}

        {viewPhase === 'result' && plan ? (
          <HomeResults
            cid={cid}
            plan={plan}
            adjustedMacroTotals={adjustedMacroTotals}
            adjustedBucketPlan={adjustedBucketPlan}
            adjustedTopFoodsByBucket={adjustedTopFoodsByBucket}
            adjustedExtendedFoods={adjustedExtendedFoods}
            editableBucketRows={editableBucketRows}
            adjustedMealDistribution={adjustedMealDistribution}
            bucketLabelIndex={bucketLabelIndex}
            onEditPlan={handleEditPlan}
            onExportExcel={exportEquivalentListExcelFile}
            onExportPdf={exportClinicalPdf}
            onReset={resetBucketAdjustments}
            onAdjustMealCell={adjustMealCellExchanges}
          />
        ) : null}
      </div>

      {isGenerating ? (
        <BootSplash variant="generate" message="Generando plan personalizado..." />
      ) : null}
      <LeadCaptureModal
        isOpen={isLeadModalOpen}
        cid={cid}
        initialFullName={profile.fullName || leadByCid?.fullName || ''}
        onClose={handleLeadClose}
        onSuccess={handleLeadSuccess}
      />
    </div>
  );
};
