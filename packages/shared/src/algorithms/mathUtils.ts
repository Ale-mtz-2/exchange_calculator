/**
 * Shared math utilities used across the monorepo.
 * Centralised here to avoid duplication in API, web, and shared algorithms.
 */

/** Round value to the nearest 0.5, clamped to ≥ 0. */
export const roundHalf = (value: number): number =>
    Math.max(0, Math.round(value * 2) / 2);

/** Like roundHalf but allows negative values — useful for delta adjustments. */
export const roundHalfSigned = (value: number): number =>
    Math.round(value * 2) / 2;

/** Clamp a number between min and max (inclusive). */
export const clamp = (value: number, minValue: number, maxValue: number): number =>
    Math.min(maxValue, Math.max(minValue, value));

/** Round a number to a given number of decimal digits (default: 1). */
export const round = (value: number, digits = 1): number => {
    const power = 10 ** digits;
    return Math.round(value * power) / power;
};
