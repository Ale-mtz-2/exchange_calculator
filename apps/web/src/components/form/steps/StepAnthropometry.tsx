import type { PatientProfile } from '@equivalentes/shared';

import {
  fieldErrorClass,
  fieldLabelClass,
  inputClass,
  selectClass,
} from '../formStyles';
import type { StepFieldErrors } from '../validators';

type StepAnthropometryProps = {
  profile: PatientProfile;
  showErrors: boolean;
  errors: StepFieldErrors;
  onProfileChange: <K extends keyof PatientProfile>(field: K, value: PatientProfile[K]) => void;
};

export const StepAnthropometry = ({
  profile,
  showErrors,
  errors,
  onProfileChange,
}: StepAnthropometryProps): JSX.Element => (
  <div className="grid gap-3 md:grid-cols-2">
    <label className={fieldLabelClass}>
      Sexo
      <select
        className={selectClass}
        value={profile.sex}
        onChange={(event) => onProfileChange('sex', event.target.value as PatientProfile['sex'])}
      >
        <option value="female">Femenino</option>
        <option value="male">Masculino</option>
      </select>
      {showErrors && errors.sex ? <span className={fieldErrorClass}>{errors.sex}</span> : null}
    </label>

    <label className={fieldLabelClass}>
      Cintura (cm)
      <input
        className={inputClass}
        type="number"
        min={40}
        max={250}
        step="0.1"
        value={profile.waistCm ?? ''}
        onChange={(event) =>
          onProfileChange('waistCm', event.target.value ? Number(event.target.value) : null)
        }
        placeholder="Opcional"
      />
      {showErrors && errors.waistCm ? (
        <span className={fieldErrorClass}>{errors.waistCm}</span>
      ) : null}
    </label>

    <label className={fieldLabelClass}>
      Peso (kg)
      <input
        className={inputClass}
        type="number"
        min={35}
        max={350}
        step="0.1"
        value={profile.weightKg}
        onChange={(event) => onProfileChange('weightKg', Number(event.target.value))}
      />
      {showErrors && errors.weightKg ? (
        <span className={fieldErrorClass}>{errors.weightKg}</span>
      ) : null}
    </label>

    <label className={fieldLabelClass}>
      Estatura (cm)
      <input
        className={inputClass}
        type="number"
        min={120}
        max={230}
        value={profile.heightCm}
        onChange={(event) => onProfileChange('heightCm', Number(event.target.value))}
      />
      {showErrors && errors.heightCm ? (
        <span className={fieldErrorClass}>{errors.heightCm}</span>
      ) : null}
    </label>

    <label className={fieldLabelClass}>
      Actividad
      <select
        className={selectClass}
        value={profile.activityLevel}
        onChange={(event) =>
          onProfileChange('activityLevel', event.target.value as PatientProfile['activityLevel'])
        }
      >
        <option value="low">Baja</option>
        <option value="medium">Media</option>
        <option value="high">Alta</option>
      </select>
      {showErrors && errors.activityLevel ? (
        <span className={fieldErrorClass}>{errors.activityLevel}</span>
      ) : null}
    </label>

    <label className={fieldLabelClass}>
      Comidas al dia
      <select
        className={selectClass}
        value={profile.mealsPerDay}
        onChange={(event) =>
          onProfileChange('mealsPerDay', Number(event.target.value) as PatientProfile['mealsPerDay'])
        }
      >
        <option value={3}>3</option>
        <option value={4}>4</option>
        <option value={5}>5</option>
      </select>
      {showErrors && errors.mealsPerDay ? (
        <span className={fieldErrorClass}>{errors.mealsPerDay}</span>
      ) : null}
    </label>
  </div>
);
