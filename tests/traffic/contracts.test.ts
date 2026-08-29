import { describe, expect, test } from "vitest";

import {
  phase1TrafficObservationSchema,
  trafficObservationSchema,
} from "../../src/traffic/contracts.js";

const measuredObservation = {
  id: "observation-1",
  sourceRecordId: "record-1",
  stationId: "station-1",
  year: 2023,
  periodType: "annual",
  vehiclesPerDay: 12_450,
  heavyVehiclePercent: 4.2,
  quality: "measured",
  sourceId: "dreal-2019-2023-point",
} as const;

describe("traffic observation contracts", () => {
  test("accepts a valid measured annual observation", () => {
    expect(phase1TrafficObservationSchema.parse(measuredObservation)).toEqual(
      measuredObservation,
    );
  });

  test("keeps interpolated in the domain but forbids it as Phase 1 output", () => {
    const interpolated = {
      ...measuredObservation,
      quality: "interpolated",
    } as const;

    expect(trafficObservationSchema.parse(interpolated)).toEqual(interpolated);
    expect(() => phase1TrafficObservationSchema.parse(interpolated)).toThrow(
      /Phase 1/i,
    );
  });

  test.each([
    ["negative traffic", { vehiclesPerDay: -1 }],
    ["heavy vehicle percentage above 100", { heavyVehiclePercent: 100.1 }],
  ])("rejects %s", (_label, replacement) => {
    expect(() =>
      phase1TrafficObservationSchema.parse({
        ...measuredObservation,
        ...replacement,
      }),
    ).toThrow();
  });
});
