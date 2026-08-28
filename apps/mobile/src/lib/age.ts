import { AgeRange } from '@masalim/types';

/** Stepper bounds from the design (Child/01: "yaş" clamped 0–12). */
export const AGE_YEARS_MIN = 0;
export const AGE_YEARS_MAX = 12;

/** Default stepper value for a fresh profile (design FormScreen default). */
export const DEFAULT_AGE_YEARS = 3;

/**
 * Exact years → backend `AgeRange` bucket. Mirrors the API's birthDate
 * bucketing (children.service `ageRangeFromBirthDate`).
 */
export function ageRangeFromYears(years: number): AgeRange {
  const clamped = clampAgeYears(years);
  if (clamped <= 2) return AgeRange.AGE_0_2;
  if (clamped <= 5) return AgeRange.AGE_3_5;
  if (clamped <= 8) return AgeRange.AGE_6_8;
  return AgeRange.AGE_9_12;
}

/** Bucket midpoints — seed the stepper for children saved without `preferences.ageYears`. */
const AGE_RANGE_MIDPOINT_YEARS: Record<AgeRange, number> = {
  [AgeRange.AGE_0_2]: 1,
  [AgeRange.AGE_3_5]: 4,
  [AgeRange.AGE_6_8]: 7,
  [AgeRange.AGE_9_12]: 10,
};

/** `AgeRange` bucket → representative exact age (midpoint). */
export function yearsFromAgeRange(range: AgeRange): number {
  return AGE_RANGE_MIDPOINT_YEARS[range];
}

/** Clamp/round any candidate value into the stepper's 0–12 integer domain. */
export function clampAgeYears(years: number): number {
  return Math.min(AGE_YEARS_MAX, Math.max(AGE_YEARS_MIN, Math.round(years)));
}
