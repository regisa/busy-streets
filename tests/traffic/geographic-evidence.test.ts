import { describe, expect, test } from "vitest";

import type {
  LinearTrafficRecord,
  NormalizedEvidence,
  Phase1TrafficObservation,
  TrafficStation,
} from "../../src/traffic/contracts.js";
import {
  createBiarritzGeographicFrame,
  parseBiarritzBoundary,
} from "../../src/traffic/geography.js";
import { applyBiarritzGeographicFrame } from "../../src/traffic/geographic-evidence.js";

const frame = createBiarritzGeographicFrame(
  parseBiarritzBoundary({
    type: "Feature",
    properties: { code: "64122", nom: "Biarritz" },
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [0.01, 0],
            [0.01, 0.01],
            [0, 0.01],
            [0, 0],
          ],
        ],
      ],
    },
  }),
);

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) result.push(value);
  return result;
}

describe("geographic evidence view", () => {
  test("scopes a station and its earlier observation while preserving line evidence", async () => {
    const station = Object.freeze({
      kind: "station" as const,
      id: "source:station:inside",
      sourceId: "source",
      sourceRecordId: "source:record:point",
      counterType: "permanent" as const,
      location: Object.freeze({
        type: "Point" as const,
        coordinates: Object.freeze([0.005, 0.005]) as unknown as [number, number],
      }),
      roadRef: "D1",
    }) satisfies TrafficStation;
    const observation = Object.freeze({
      id: "source:record:point:observation:2024",
      sourceRecordId: "source:record:point",
      stationId: station.id,
      year: 2024,
      periodType: "annual" as const,
      vehiclesPerDay: 12_000,
      heavyVehiclePercent: 6,
      quality: "measured" as const,
      sourceId: "source",
    }) satisfies Phase1TrafficObservation;
    const linear = Object.freeze({
      kind: "linear-traffic" as const,
      id: "source:line:1",
      sourceId: "source",
      sourceRecordId: "source:record:line",
      geometry: Object.freeze({
        type: "LineString" as const,
        coordinates: Object.freeze([
          Object.freeze([-0.005, 0.005]),
          Object.freeze([0.015, 0.005]),
        ]) as unknown as [[number, number], [number, number]],
      }),
      observation: Object.freeze({
        id: "source:record:line:observation:2023",
        sourceRecordId: "source:record:line",
        sourceGeometryId: "line-1",
        year: 2023,
        periodType: "annual" as const,
        vehiclesPerDay: 10_000,
        heavyVehiclePercent: null,
        quality: "unknown" as const,
        sourceId: "source",
      }),
    }) satisfies LinearTrafficRecord;
    const input: readonly NormalizedEvidence[] = [
      observation,
      station,
      linear,
    ];

    const result = await collect(applyBiarritzGeographicFrame(input, frame));

    expect(result).toEqual([
      { ...station, geographicScope: "inside-municipality" },
      { ...observation, geographicScope: "inside-municipality" },
      {
        ...linear,
        geographicCoverage: {
          municipalityIntersects: true,
          bufferIntersects: true,
          lengthInsideMunicipalityKilometers: expect.closeTo(1.11195, 3),
        },
      },
    ]);
    expect(station).not.toHaveProperty("geographicScope");
    expect(observation).not.toHaveProperty("geographicScope");
    expect(linear).not.toHaveProperty("geographicCoverage");
  });

  test.each([
    { coordinates: [-0.005, 0.005], expected: "buffer-only" },
    { coordinates: [-0.05, 0.005], expected: "outside" },
  ] as const)(
    "keeps station and observation scope aligned for $expected evidence",
    async ({ coordinates, expected }) => {
      const station = {
        kind: "station" as const,
        id: `source:station:${expected}`,
        sourceId: "source",
        sourceRecordId: `source:record:${expected}`,
        counterType: "permanent" as const,
        location: { type: "Point" as const, coordinates: [...coordinates] },
      } satisfies TrafficStation;
      const observation = {
        id: `source:observation:${expected}`,
        sourceRecordId: station.sourceRecordId,
        stationId: station.id,
        year: 2024,
        periodType: "annual" as const,
        vehiclesPerDay: 1_000,
        heavyVehiclePercent: null,
        quality: "measured" as const,
        sourceId: "source",
      } satisfies Phase1TrafficObservation;

      const result = await collect(
        applyBiarritzGeographicFrame([station, observation], frame),
      );

      expect(result).toEqual([
        { ...station, geographicScope: expected },
        { ...observation, geographicScope: expected },
      ]);
    },
  );

  test("reports observations that cannot be tied to a station without inventing scope", async () => {
    const issues: Array<{ readonly code: string; readonly sourceRecordId?: string }> =
      [];
    const withoutStationId = {
      id: "source:observation:missing-id",
      sourceRecordId: "source:record:missing-id",
      year: 2024,
      periodType: "annual" as const,
      vehiclesPerDay: 1_000,
      heavyVehiclePercent: null,
      quality: "measured" as const,
      sourceId: "source",
    } satisfies Phase1TrafficObservation;
    const unavailableStation = {
      ...withoutStationId,
      id: "source:observation:unknown-station",
      sourceRecordId: "source:record:unknown-station",
      stationId: "source:station:unknown",
    } satisfies Phase1TrafficObservation;

    const result = await collect(
      applyBiarritzGeographicFrame(
        [withoutStationId, unavailableStation],
        frame,
        (issue) => issues.push(issue),
      ),
    );

    expect(result).toEqual([]);
    expect(issues).toEqual([
      {
        code: "unscoped-traffic-observation",
        severity: "error",
        sourceId: "source",
        sourceRecordId: "source:record:missing-id",
        message:
          "Traffic observation source:observation:missing-id cannot be classified without a station ID",
      },
      {
        code: "unscoped-traffic-observation",
        severity: "error",
        sourceId: "source",
        sourceRecordId: "source:record:unknown-station",
        message:
          "Traffic observation source:observation:unknown-station references unavailable station source:station:unknown",
      },
    ]);
  });

  test("fails the view when one station ID identifies different source records", async () => {
    const issues: Array<{ readonly code: string }> = [];
    const insideStation = {
      kind: "station" as const,
      id: "source:station:duplicate",
      sourceId: "source",
      sourceRecordId: "source:record:inside",
      counterType: "permanent" as const,
      location: { type: "Point" as const, coordinates: [0.005, 0.005] },
    } satisfies TrafficStation;
    const outsideStation = {
      ...insideStation,
      sourceRecordId: "source:record:outside",
      location: { type: "Point" as const, coordinates: [-0.05, 0.005] },
    } satisfies TrafficStation;
    const observation = {
      id: "source:observation:duplicate",
      sourceRecordId: insideStation.sourceRecordId,
      stationId: insideStation.id,
      year: 2024,
      periodType: "annual" as const,
      vehiclesPerDay: 1_000,
      heavyVehiclePercent: null,
      quality: "measured" as const,
      sourceId: "source",
    } satisfies Phase1TrafficObservation;

    await expect(
      collect(
        applyBiarritzGeographicFrame(
          [insideStation, observation, outsideStation],
          frame,
          (issue) => issues.push(issue),
        ),
      ),
    ).rejects.toThrow(
      "Station source:station:duplicate appears more than once in geographic evidence",
    );
    expect(issues).toEqual([
      {
        code: "duplicate-station-id",
        severity: "error",
        sourceId: "source",
        sourceRecordId: "source:record:outside",
        message:
          "Station source:station:duplicate appears more than once in geographic evidence",
      },
    ]);
  });
});
