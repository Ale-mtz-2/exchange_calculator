import {
    COUNTRY_STATES,
    EXCHANGE_SYSTEMS,
    type PatientProfile,
} from '@equivalentes/shared';
import { type AppOptions } from '../../lib/api';

export const parseCsvText = (value: string): string[] =>
    value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

export const defaultProfile = (): PatientProfile => ({
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

export const MAX_DYNAMIC_EXCHANGES = 24;

export const FORM_STEPS = [
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

export const round = (value: number, digits = 1): number => {
    const power = 10 ** digits;
    return Math.round(value * power) / power;
};

export const clamp = (value: number, minValue: number, maxValue: number): number =>
    Math.min(maxValue, Math.max(minValue, value));

export const getDefaultState = (options: AppOptions | null, countryCode: string): string => {
    const list =
        options?.statesByCountry[countryCode] ??
        COUNTRY_STATES[countryCode as keyof typeof COUNTRY_STATES];
    return list?.[0]?.code ?? '';
};

export const getDefaultSystem = (options: AppOptions | null, countryCode: string): string => {
    const list = options?.systems ?? EXCHANGE_SYSTEMS;
    return list.find((system) => system.countryCode === countryCode)?.id ?? 'mx_smae';
};

export const FEATURES = [
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
] as const;

export type CsvInputs = {
    allergiesText: string;
    intolerancesText: string;
    likesText: string;
    dislikesText: string;
};

export type ViewPhase = 'form' | 'generating' | 'result';
