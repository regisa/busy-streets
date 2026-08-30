import type { ReconciledTrafficObservation } from "../traffic/reconciliation.js";

export type ComparisonReason =
  | "different-location"
  | "same-year"
  | "reversed-year-order"
  | "unresolved-conflict"
  | "missing-canonical-value"
  | "null-traffic-value"
  | "different-quality";

export type AnnualComparison =
  | { readonly eligibility: "ineligible"; readonly reason: ComparisonReason }
  | {
      readonly eligibility: "eligible";
      readonly baselineYear: number;
      readonly comparisonYear: number;
      readonly baselineVehiclesPerDay: number;
      readonly comparisonVehiclesPerDay: number;
      readonly absoluteChange: number;
      readonly percentageChange: number | null;
    };

export function compareAnnualObservations(
  baseline: ReconciledTrafficObservation,
  comparison: ReconciledTrafficObservation,
): AnnualComparison {
  if (baseline.subjectId !== comparison.subjectId) {
    return { eligibility: "ineligible", reason: "different-location" };
  }
  if (baseline.year === comparison.year) {
    return { eligibility: "ineligible", reason: "same-year" };
  }
  if (baseline.year > comparison.year) {
    return { eligibility: "ineligible", reason: "reversed-year-order" };
  }
  if (
    baseline.resolution === "unresolved-conflict" ||
    comparison.resolution === "unresolved-conflict"
  ) {
    return { eligibility: "ineligible", reason: "unresolved-conflict" };
  }
  if (!baseline.comparisonValue || !comparison.comparisonValue) {
    return { eligibility: "ineligible", reason: "missing-canonical-value" };
  }
  const baselineValue = baseline.comparisonValue.vehiclesPerDay;
  const comparisonValue = comparison.comparisonValue.vehiclesPerDay;
  if (baselineValue === null || comparisonValue === null) {
    return { eligibility: "ineligible", reason: "null-traffic-value" };
  }
  if (baseline.comparisonValue.quality !== comparison.comparisonValue.quality) {
    return { eligibility: "ineligible", reason: "different-quality" };
  }

  const absoluteChange = comparisonValue - baselineValue;
  return {
    eligibility: "eligible",
    baselineYear: baseline.year,
    comparisonYear: comparison.year,
    baselineVehiclesPerDay: baselineValue,
    comparisonVehiclesPerDay: comparisonValue,
    absoluteChange,
    percentageChange:
      baselineValue === 0 ? null : (absoluteChange / baselineValue) * 100,
  };
}
