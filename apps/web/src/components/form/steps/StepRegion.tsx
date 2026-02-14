import type { PatientProfile } from '@equivalentes/shared';

import {
  fieldErrorClass,
  fieldLabelClass,
  selectClass,
} from '../formStyles';
import type { StepFieldErrors } from '../validators';

type StepRegionProps = {
  profile: PatientProfile;
  countries: { code: string; name: string }[];
  states: { code: string; name: string }[];
  systems: { id: string; name: string }[];
  showErrors: boolean;
  errors: StepFieldErrors;
  onCountryChange: (countryCode: PatientProfile['countryCode']) => void;
  onStateChange: (stateCode: string) => void;
  onSystemChange: (systemId: PatientProfile['systemId']) => void;
};

export const StepRegion = ({
  profile,
  countries,
  states,
  systems,
  showErrors,
  errors,
  onCountryChange,
  onStateChange,
  onSystemChange,
}: StepRegionProps): JSX.Element => (
  <div className="grid gap-3 md:grid-cols-2">
    <label className={fieldLabelClass}>
      Pais
      <select
        className={selectClass}
        value={profile.countryCode}
        onChange={(event) => onCountryChange(event.target.value as PatientProfile['countryCode'])}
      >
        {countries.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </select>
      {showErrors && errors.countryCode ? (
        <span className={fieldErrorClass}>{errors.countryCode}</span>
      ) : null}
    </label>

    <label className={fieldLabelClass}>
      Estado / provincia
      <select
        className={selectClass}
        value={profile.stateCode}
        onChange={(event) => onStateChange(event.target.value)}
      >
        {states.map((state) => (
          <option key={state.code} value={state.code}>
            {state.name}
          </option>
        ))}
      </select>
      {showErrors && errors.stateCode ? (
        <span className={fieldErrorClass}>{errors.stateCode}</span>
      ) : null}
    </label>

    <label className={`${fieldLabelClass} md:col-span-2`}>
      Sistema de equivalentes
      <select
        className={selectClass}
        value={profile.systemId}
        onChange={(event) => onSystemChange(event.target.value as PatientProfile['systemId'])}
      >
        {systems.map((system) => (
          <option key={system.id} value={system.id}>
            {system.name}
          </option>
        ))}
      </select>
      {showErrors && errors.systemId ? (
        <span className={fieldErrorClass}>{errors.systemId}</span>
      ) : null}
    </label>
  </div>
);

