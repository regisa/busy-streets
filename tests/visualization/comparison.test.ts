import { describe, expect, test } from "vitest";

import type { ReconciledTrafficObservation } from "../../src/traffic/reconciliation.js";
import { compareAnnualObservations } from "../../src/visualization/comparison.js";

function observation(
  year: number,
  vehiclesPerDay: number | null,
  quality: "measured" | "modeled" | "unknown" = "measured",
): ReconciledTrafficObservation {
  const variant = {
    vehiclesPerDay,
    heavyVehiclePercent: null,
    quality,
    latestPublicationDate: "2026-05-21",
    sourceLinks: [
      {
        observationId: `observation:${year}`,
        sourceId: "dreal-2024-point",
        sourceRecordId: `record:${year}`,
        publicationDate: "2026-05-21",
      },
    ],
  };
  return {
    subjectId: "station-group:one",
    year,
    periodType: "annual",
    variants: [variant],
    resolution: "canonical",
    canonical: variant,
    comparisonValue: { vehiclesPerDay, heavyVehiclePercent: null, quality },
  };
}

describe("annual traffic comparison", () => {
  test("compares two canonical years at the same location", () => {
    expect(
      compareAnnualObservations(
        observation(2021, 30_000),
        observation(2024, 32_000),
      ),
    ).toEqual({
      eligibility: "eligible",
      baselineYear: 2021,
      comparisonYear: 2024,
      baselineVehiclesPerDay: 30_000,
      comparisonVehiclesPerDay: 32_000,
      absoluteChange: 2_000,
      percentageChange: 6.666666666666667,
    });
  });

  test("keeps a zero baseline eligible without inventing a percentage", () => {
    expect(
      compareAnnualObservations(observation(2021, 0), observation(2024, 10)),
    ).toMatchObject({
      eligibility: "eligible",
      absoluteChange: 10,
      percentageChange: null,
    });
  });

  test("rejects missing values, unresolved conflicts, and mixed quality", () => {
    expect(
      compareAnnualObservations(
        observation(2021, null),
        observation(2024, 32_000),
      ),
    ).toEqual({ eligibility: "ineligible", reason: "null-traffic-value" });

    const conflict: ReconciledTrafficObservation = {
      ...observation(2021, 30_000),
      resolution: "unresolved-conflict",
      canonical: null,
      comparisonValue: null,
    };
    expect(
      compareAnnualObservations(conflict, observation(2024, 32_000)),
    ).toEqual({ eligibility: "ineligible", reason: "unresolved-conflict" });

    expect(
      compareAnnualObservations(
        observation(2021, 30_000, "modeled"),
        observation(2024, 32_000, "measured"),
      ),
    ).toEqual({ eligibility: "ineligible", reason: "different-quality" });
  });

  test("requires chronological distinct years at one subject", () => {
    expect(
      compareAnnualObservations(
        observation(2024, 32_000),
        observation(2021, 30_000),
      ),
    ).toEqual({ eligibility: "ineligible", reason: "reversed-year-order" });
    expect(
      compareAnnualObservations(
        observation(2024, 32_000),
        observation(2024, 32_000),
      ),
    ).toEqual({ eligibility: "ineligible", reason: "same-year" });
    expect(
      compareAnnualObservations(
        observation(2021, 30_000),
        { ...observation(2024, 32_000), subjectId: "station-group:two" },
      ),
    ).toEqual({ eligibility: "ineligible", reason: "different-location" });
  });
});
