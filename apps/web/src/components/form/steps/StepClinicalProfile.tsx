import type { PatientProfile } from '@equivalentes/shared';

import {
  fieldErrorClass,
  fieldLabelClass,
  inputClass,
  selectClass,
} from '../formStyles';
import type { StepFieldErrors } from '../validators';

type StepClinicalProfileProps = {
  profile: PatientProfile;
  showErrors: boolean;
  errors: StepFieldErrors;
  onProfileChange: <K extends keyof PatientProfile>(field: K, value: PatientProfile[K]) => void;
};

export const StepClinicalProfile = ({
  profile,
  showErrors,
  errors,
  onProfileChange,
}: StepClinicalProfileProps): JSX.Element => (
  <div className="grid gap-4">
    <div className="grid gap-3 md:grid-cols-2">
      <label className={`${fieldLabelClass} md:col-span-2`}>
        Nombre completo
        <input
          className={inputClass}
          value={profile.fullName}
          onChange={(event) => onProfileChange('fullName', event.target.value)}
          placeholder="Nombre y apellidos"
        />
        {showErrors && errors.fullName ? (
          <span className={fieldErrorClass}>{errors.fullName}</span>
        ) : null}
      </label>

      <label className={fieldLabelClass}>
        Fecha de nacimiento
        <input
          className={inputClass}
          type="date"
          value={profile.birthDate ?? ''}
          onChange={(event) => onProfileChange('birthDate', event.target.value || null)}
        />
        {showErrors && errors.birthDate ? (
          <span className={fieldErrorClass}>{errors.birthDate}</span>
        ) : null}
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
        Ventana de entrenamiento
        <select
          className={selectClass}
          value={profile.trainingWindow}
          onChange={(event) =>
            onProfileChange('trainingWindow', event.target.value as PatientProfile['trainingWindow'])
          }
        >
          <option value="none">Sin ventana fija</option>
          <option value="morning">Manana</option>
          <option value="afternoon">Tarde</option>
          <option value="evening">Noche</option>
        </select>
      </label>
    </div>

    <div className="grid gap-2 rounded-xl border border-sky/15 bg-sky-50/30 p-3">
      <p className="text-xs font-semibold text-slate-700">Banderas clinicas</p>
      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          checked={profile.hasDiabetes}
          onChange={(event) => onProfileChange('hasDiabetes', event.target.checked)}
          type="checkbox"
        />
        Diabetes
      </label>
      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          checked={profile.hasHypertension}
          onChange={(event) => onProfileChange('hasHypertension', event.target.checked)}
          type="checkbox"
        />
        Hipertension
      </label>
      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          checked={profile.hasDyslipidemia}
          onChange={(event) => onProfileChange('hasDyslipidemia', event.target.checked)}
          type="checkbox"
        />
        Dislipidemia
      </label>
      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          checked={profile.usesDairyInSnacks}
          onChange={(event) => onProfileChange('usesDairyInSnacks', event.target.checked)}
          type="checkbox"
        />
        Usar lacteos en colaciones
      </label>
    </div>
  </div>
);
