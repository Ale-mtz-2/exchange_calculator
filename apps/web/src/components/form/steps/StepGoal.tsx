import type { KcalFormulaId, PatientProfile } from '@equivalentes/shared';

import { GoalDeltaHoldBar } from '../../GoalDeltaHoldBar';
import {
  fieldErrorClass,
  fieldLabelClass,
  selectClass,
} from '../formStyles';
import type { StepFieldErrors, WeeklyGoalSetting } from '../validators';

type StepGoalProps = {
  profile: PatientProfile;
  weeklyGoalSetting: WeeklyGoalSetting;
  formulas: { id: KcalFormulaId; name: string; description: string }[];
  showErrors: boolean;
  errors: StepFieldErrors;
  onGoalChange: (goal: PatientProfile['goal']) => void;
  onGoalDeltaChange: (value: number) => void;
  onFormulaChange: (formulaId: PatientProfile['formulaId']) => void;
};

export const StepGoal = ({
  profile,
  weeklyGoalSetting,
  formulas,
  showErrors,
  errors,
  onGoalChange,
  onGoalDeltaChange,
  onFormulaChange,
}: StepGoalProps): JSX.Element => (
  <div className="grid gap-4">
    <div className="grid gap-3 md:grid-cols-2">
      <label className={fieldLabelClass}>
        Objetivo
        <select
          className={selectClass}
          value={profile.goal}
          onChange={(event) => onGoalChange(event.target.value as PatientProfile['goal'])}
        >
          <option value="maintain">Mantener</option>
          <option value="lose_fat">Perder grasa</option>
          <option value="gain_muscle">Ganar musculo</option>
        </select>
        {showErrors && errors.goal ? <span className={fieldErrorClass}>{errors.goal}</span> : null}
      </label>

      <label className={fieldLabelClass}>
        Formula kcal
        <select
          className={selectClass}
          value={profile.formulaId}
          onChange={(event) => onFormulaChange(event.target.value as PatientProfile['formulaId'])}
        >
          {formulas.map((formula) => (
            <option key={formula.id} value={formula.id}>
              {formula.name}
            </option>
          ))}
        </select>
        {showErrors && errors.formulaId ? (
          <span className={fieldErrorClass}>{errors.formulaId}</span>
        ) : null}
      </label>
    </div>

    <GoalDeltaHoldBar
      goal={profile.goal}
      value={profile.goalDeltaKgPerWeek}
      onChange={onGoalDeltaChange}
      min={weeklyGoalSetting.min}
      max={weeklyGoalSetting.max}
      recommended={weeklyGoalSetting.recommended}
    />
    {showErrors && errors.goalDeltaKgPerWeek ? (
      <span className={fieldErrorClass}>{errors.goalDeltaKgPerWeek}</span>
    ) : null}
  </div>
);

