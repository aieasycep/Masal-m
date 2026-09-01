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

/** Birth month/year pair driving the QA design's "Doğum ayı ve yılı" field. */
export interface BirthYearMonth {
  year: number;
  /** 1–12. */
  month: number;
}

/** API wire format for Child.birthDate — first day of the birth month. */
export function birthDateFromYearMonth({ year, month }: BirthYearMonth): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** Parse a stored birthDate (ISO date or datetime) back into year/month. */
export function yearMonthFromBirthDate(
  value: string | null | undefined,
): BirthYearMonth | null {
  if (value == null) return null;
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (match == null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** Whole years old today (month-accurate, clamped ≥ 0). */
export function ageFromYearMonth(birth: BirthYearMonth, now: Date = new Date()): number {
  let age = now.getFullYear() - birth.year;
  if (now.getMonth() + 1 < birth.month) age -= 1;
  return Math.max(0, age);
}

/** Fresh-profile default: January, three years back (design default ≈ 3 yaş). */
export function defaultBirthYearMonth(now: Date = new Date()): BirthYearMonth {
  return { year: now.getFullYear() - DEFAULT_AGE_YEARS, month: 1 };
}

/** Seed the picker for a child saved before birthDate existed in the UI. */
export function fallbackBirthYearMonth(
  ageYears: number | undefined,
  range: AgeRange,
  now: Date = new Date(),
): BirthYearMonth {
  const years = ageYears ?? yearsFromAgeRange(range);
  return { year: now.getFullYear() - clampAgeYears(years), month: 1 };
}
