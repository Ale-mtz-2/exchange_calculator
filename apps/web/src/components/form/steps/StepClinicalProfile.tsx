import type { PatientProfile } from '@equivalentes/shared';

import type { PersonalPreferences } from '../../../lib/personalPreferences';
import {
  fieldErrorClass,
  fieldLabelClass,
  inputClass,
  selectClass,
} from '../formStyles';
import type { StepFieldErrors } from '../validators';

type StepClinicalProfileProps = {
  profile: PatientProfile;
  personalPreferences: PersonalPreferences;
  showErrors: boolean;
  errors: StepFieldErrors;
  onProfileChange: <K extends keyof PatientProfile>(field: K, value: PatientProfile[K]) => void;
  onPersonalPreferenceChange: <K extends keyof PersonalPreferences>(
    field: K,
    value: PersonalPreferences[K],
  ) => void;
};

export const StepClinicalProfile = ({
  profile,
  personalPreferences,
  showErrors,
  errors,
  onProfileChange,
  onPersonalPreferenceChange,
}: StepClinicalProfileProps): JSX.Element => (
  <div className="grid gap-4">
    <div className="grid gap-3 md:grid-cols-2">
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

      <label className={fieldLabelClass}>
        Enfoque del plan
        <select
          className={selectClass}
          value={profile.planningFocus}
          onChange={(event) =>
            onProfileChange('planningFocus', event.target.value as PatientProfile['planningFocus'])
          }
        >
          <option value="clinical">Clinico</option>
          <option value="hybrid_sport">Clinico + Deportivo (simetrico)</option>
        </select>
      </label>

      {profile.mealsPerDay === 3 ? (
        <p className="md:col-span-2 text-xs text-slate-600">
          Nota: Con 3 comidas por dia no se generan colaciones separadas. Las preferencias de colacion se
          redistribuyen entre desayuno, comida y cena.
        </p>
      ) : null}
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
    </div>

    <div className="grid gap-2 rounded-xl border border-sky/15 bg-sky-50/30 p-3">
      <p className="text-xs font-semibold text-slate-700">Preferencias personales</p>
      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          checked={profile.usesDairyInSnacks}
          onChange={(event) => onProfileChange('usesDairyInSnacks', event.target.checked)}
          type="checkbox"
        />
        Incluir lacteos en colaciones
      </label>
      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          checked={personalPreferences.prefersSweetSnacks}
          onChange={(event) =>
            onPersonalPreferenceChange('prefersSweetSnacks', event.target.checked)
          }
          type="checkbox"
        />
        Prefiere colaciones dulces
      </label>
      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          checked={personalPreferences.prefersSavorySnacks}
          onChange={(event) =>
            onPersonalPreferenceChange('prefersSavorySnacks', event.target.checked)
          }
          type="checkbox"
        />
        Prefiere colaciones saladas
      </label>
      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          checked={personalPreferences.avoidsUltraProcessed}
          onChange={(event) =>
            onPersonalPreferenceChange('avoidsUltraProcessed', event.target.checked)
          }
          type="checkbox"
        />
        Evita ultraprocesados
      </label>
    </div>
  </div>
);
