import type { PatientProfile } from '@equivalentes/shared';

import {
  fieldErrorClass,
  fieldLabelClass,
  inputClass,
  selectClass,
} from '../formStyles';
import type { StepFieldErrors } from '../validators';

type CsvInputs = {
  likesText: string;
  dislikesText: string;
};

type StepHabitsProps = {
  profile: PatientProfile;
  csvInputs: CsvInputs;
  showErrors: boolean;
  errors: StepFieldErrors;
  onProfileChange: <K extends keyof PatientProfile>(field: K, value: PatientProfile[K]) => void;
  onCsvChange: (field: keyof CsvInputs, value: string) => void;
};

export const StepHabits = ({
  profile,
  csvInputs,
  showErrors,
  errors,
  onProfileChange,
  onCsvChange,
}: StepHabitsProps): JSX.Element => (
  <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-2">
      <label className={fieldLabelClass}>
        Patron alimentario
        <select
          className={selectClass}
          value={profile.dietPattern}
          onChange={(event) =>
            onProfileChange('dietPattern', event.target.value as PatientProfile['dietPattern'])
          }
        >
          <option value="omnivore">Omnivoro</option>
          <option value="vegetarian">Vegetariano</option>
          <option value="vegan">Vegano</option>
          <option value="pescatarian">Pescetariano</option>
        </select>
        {showErrors && errors.dietPattern ? (
          <span className={fieldErrorClass}>{errors.dietPattern}</span>
        ) : null}
      </label>

      <label className={fieldLabelClass}>
        Presupuesto
        <select
          className={selectClass}
          value={profile.budgetLevel}
          onChange={(event) =>
            onProfileChange('budgetLevel', event.target.value as PatientProfile['budgetLevel'])
          }
        >
          <option value="low">Bajo</option>
          <option value="medium">Medio</option>
          <option value="high">Alto</option>
        </select>
        {showErrors && errors.budgetLevel ? (
          <span className={fieldErrorClass}>{errors.budgetLevel}</span>
        ) : null}
      </label>

      <label className={fieldLabelClass}>
        Tiempo de preparacion
        <select
          className={selectClass}
          value={profile.prepTimeLevel}
          onChange={(event) =>
            onProfileChange('prepTimeLevel', event.target.value as PatientProfile['prepTimeLevel'])
          }
        >
          <option value="short">Corto</option>
          <option value="medium">Medio</option>
          <option value="long">Largo</option>
        </select>
        {showErrors && errors.prepTimeLevel ? (
          <span className={fieldErrorClass}>{errors.prepTimeLevel}</span>
        ) : null}
      </label>
    </div>

    <div className="grid gap-3">
      <label className={fieldLabelClass}>
        Preferencias (coma separada)
        <input
          className={inputClass}
          value={csvInputs.likesText}
          onChange={(event) => onCsvChange('likesText', event.target.value)}
          placeholder="avena, pollo, arroz"
        />
      </label>

      <label className={fieldLabelClass}>
        No le gusta (coma separada)
        <input
          className={inputClass}
          value={csvInputs.dislikesText}
          onChange={(event) => onCsvChange('dislikesText', event.target.value)}
          placeholder="brocoli, coliflor"
        />
      </label>
    </div>
  </div>
);

