import { describe, expect, test } from "vitest";

import type { Phase1TrafficObservation } from "../../src/traffic/contracts.js";
import { reconcileTrafficObservations } from "../../src/traffic/reconciliation.js";

function observation(
  overrides: Partial<Phase1TrafficObservation> = {},
): Phase1TrafficObservation {
  return {
    id: "source-a:observation:2024",
    sourceRecordId: "source-a:record:1",
    stationId: "source-a:station:1",
    year: 2024,
    periodType: "annual",
    vehiclesPerDay: 10_000,
    heavyVehiclePercent: 5,
    quality: "measured",
    sourceId: "dreal-2019-2023-point",
    ...overrides,
  };
}

describe("traffic observation reconciliation", () => {
  test("retains CD64 and DREAL links for the matching Biarritz 2022 count", () => {
    const result = reconcileTrafficObservations([
      {
        subjectId: "64-D810-12+520",
        observation: observation({
          id: "dreal:observation:2022",
          sourceRecordId: "dreal:record",
          year: 2022,
          vehiclesPerDay: 35_551,
          heavyVehiclePercent: 2.66,
        }),
      },
      {
        subjectId: "64-D810-12+520",
        observation: observation({
          id: "cd64:observation:2022",
          sourceRecordId: "cd64:record",
          stationId: "cd64-latest-road-counts-point:station:86",
          sourceId: "cd64-latest-road-counts-point",
          year: 2022,
          vehiclesPerDay: 35_551,
          heavyVehiclePercent: 2.66,
        }),
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      resolution: "canonical",
      comparisonValue: {
        vehiclesPerDay: 35_551,
        heavyVehiclePercent: 2.66,
        quality: "measured",
      },
    });
    expect(result[0]?.variants).toHaveLength(1);
    expect(result[0]?.variants[0]?.sourceLinks).toHaveLength(2);
  });

  test("collapses exact value-and-quality duplicates while retaining every source link", () => {
    const result = reconcileTrafficObservations([
      {
        subjectId: "continuity:station-1",
        observation: observation(),
      },
      {
        subjectId: "continuity:station-1",
        observation: observation({
          id: "source-b:observation:2024",
          sourceRecordId: "source-b:record:9",
          stationId: "source-b:station:9",
          sourceId: "dreal-2024-point",
        }),
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      subjectId: "continuity:station-1",
      year: 2024,
      periodType: "annual",
      resolution: "canonical",
      comparisonValue: {
        vehiclesPerDay: 10_000,
        heavyVehiclePercent: 5,
        quality: "measured",
      },
    });
    expect(result[0]?.variants).toEqual([
      {
        vehiclesPerDay: 10_000,
        heavyVehiclePercent: 5,
        quality: "measured",
        latestPublicationDate: "2026-05-21",
        sourceLinks: [
          {
            observationId: "source-a:observation:2024",
            sourceId: "dreal-2019-2023-point",
            sourceRecordId: "source-a:record:1",
            publicationDate: "2025-04-10",
          },
          {
            observationId: "source-b:observation:2024",
            sourceId: "dreal-2024-point",
            sourceRecordId: "source-b:record:9",
            publicationDate: "2026-05-21",
          },
        ],
      },
    ]);
    expect(result[0]?.canonical).toBe(result[0]?.variants[0]);
  });

  test("prefers measured evidence over a newer modeled value", () => {
    const result = reconcileTrafficObservations([
      {
        subjectId: "continuity:station-1",
        observation: observation({
          id: "source-b:observation:2024",
          sourceId: "dreal-2024-point",
          sourceRecordId: "source-b:record:9",
          vehiclesPerDay: 12_000,
          quality: "modeled",
        }),
      },
      {
        subjectId: "continuity:station-1",
        observation: observation({ vehiclesPerDay: 9_000 }),
      },
    ]);

    expect(result[0]).toMatchObject({
      resolution: "canonical",
      canonical: {
        vehiclesPerDay: 9_000,
        quality: "measured",
      },
      comparisonValue: {
        vehiclesPerDay: 9_000,
        heavyVehiclePercent: 5,
        quality: "measured",
      },
    });
    expect(result[0]?.variants).toHaveLength(2);
  });

  test("prefers the newer publication when top-quality values disagree", () => {
    const result = reconcileTrafficObservations([
      {
        subjectId: "continuity:station-1",
        observation: observation({ vehiclesPerDay: 9_000 }),
      },
      {
        subjectId: "continuity:station-1",
        observation: observation({
          id: "source-b:observation:2024",
          sourceId: "dreal-2024-point",
          sourceRecordId: "source-b:record:9",
          vehiclesPerDay: 12_000,
        }),
      },
    ]);

    expect(result[0]).toMatchObject({
      resolution: "canonical",
      canonical: {
        vehiclesPerDay: 12_000,
        quality: "measured",
        latestPublicationDate: "2026-05-21",
      },
      comparisonValue: {
        vehiclesPerDay: 12_000,
        heavyVehiclePercent: 5,
        quality: "measured",
      },
    });
  });

  test("keeps equal-authority disagreement unresolved and out of comparisons", () => {
    const result = reconcileTrafficObservations([
      {
        subjectId: "continuity:station-1",
        observation: observation({ vehiclesPerDay: 9_000 }),
      },
      {
        subjectId: "continuity:station-1",
        observation: observation({
          id: "source-b:observation:2024",
          sourceId: "dreal-2019-2023-point",
          sourceRecordId: "source-b:record:9",
          vehiclesPerDay: 12_000,
        }),
      },
      {
        subjectId: "continuity:station-1",
        observation: observation({
          id: "source-c:observation:2024",
          sourceId: "dreal-2024-point",
          sourceRecordId: "source-c:record:3",
          vehiclesPerDay: 8_000,
          quality: "modeled",
        }),
      },
    ]);

    expect(result[0]).toMatchObject({
      resolution: "unresolved-conflict",
      canonical: null,
      comparisonValue: null,
    });
    expect(result[0]?.variants).toHaveLength(3);
  });

  test("produces the same ordered view regardless of input order", () => {
    const inputs = [
      {
        subjectId: "continuity:station-b",
        observation: observation({
          id: "source-b:observation:2024",
          sourceId: "dreal-2024-point",
          sourceRecordId: "source-b:record:9",
        }),
      },
      {
        subjectId: "continuity:station-a",
        observation: observation({ vehiclesPerDay: 12_000 }),
      },
      {
        subjectId: "continuity:station-a",
        observation: observation({
          id: "source-c:observation:2024",
          sourceId: "dreal-2024-linear",
          sourceRecordId: "source-c:record:3",
          vehiclesPerDay: 9_000,
        }),
      },
    ] as const;

    const forward = reconcileTrafficObservations(inputs);
    const reversed = reconcileTrafficObservations([...inputs].reverse());

    expect(reversed).toEqual(forward);
    expect(forward.map((group) => group.subjectId)).toEqual([
      "continuity:station-a",
      "continuity:station-b",
    ]);
    expect(forward[0]?.variants.map((variant) => variant.vehiclesPerDay)).toEqual([
      9_000,
      12_000,
    ]);
  });

  test("rejects a source without an official publication definition", () => {
    expect(() =>
      reconcileTrafficObservations([
        {
          subjectId: "continuity:station-1",
          observation: observation({ sourceId: "source-not-catalogued" }),
        },
      ]),
    ).toThrow("Source source-not-catalogued has no official publication definition");
  });

  test("rejects interpolated input instead of admitting it to the Phase 1 view", () => {
    expect(() =>
      reconcileTrafficObservations([
        {
          subjectId: "continuity:station-1",
          observation: observation({ quality: "interpolated" }),
        },
      ]),
    ).toThrow("Phase 1 must not emit interpolated traffic observations");
  });

  test("rejects an empty comparison subject", () => {
    expect(() =>
      reconcileTrafficObservations([
        {
          subjectId: "",
          observation: observation(),
        },
      ]),
    ).toThrow("Comparison subject must be a non-empty string");
  });

  test("totally orders retained source links when observation IDs collide", () => {
    const inputs = [
      {
        subjectId: "continuity:station-1",
        observation: observation({
          id: "shared-observation-id",
          sourceRecordId: "record-b",
          sourceId: "dreal-2024-point",
        }),
      },
      {
        subjectId: "continuity:station-1",
        observation: observation({
          id: "shared-observation-id",
          sourceRecordId: "record-a",
          sourceId: "dreal-2019-2023-point",
        }),
      },
    ] as const;

    expect(reconcileTrafficObservations([...inputs].reverse())).toEqual(
      reconcileTrafficObservations(inputs),
    );
  });
});
