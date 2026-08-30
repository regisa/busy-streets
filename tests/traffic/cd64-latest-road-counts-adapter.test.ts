import type { SourceRecord } from "../../src/traffic/contracts.js";
import {
  normalizeCd64LatestRoadCountRecord,
  TrafficNormalizationError,
} from "../../src/traffic/adapters/cd64-latest-road-counts.js";
import { describe, expect, test } from "vitest";

function sourceRecord(
  properties: Readonly<Record<string, unknown>>,
): SourceRecord {
  return {
    id: "cd64-latest-road-counts-point:fixture:record:0",
    sourceId: "cd64-latest-road-counts-point",
    artifactId: "cd64-latest-road-counts-point:fixture",
    geometry: {
      type: "Point",
      coordinates: [-1.5434754896, 43.4642264044],
    },
    properties,
  };
}

describe("CD64 latest road counts adapter", () => {
  test("normalizes the official Biarritz annual count as measured evidence", () => {
    expect(
      normalizeCd64LatestRoadCountRecord(
        sourceRecord({
          annee: "2022",
          voie: "RD 810",
          pr: "12 + 520",
          commune: "Biarritz",
          code_insee: "64122",
          mja: 35_551,
          mjapl: 947,
          mjappl: 2.66,
          id: "86",
        }),
      ),
    ).toEqual([
      {
        kind: "station",
        id: "cd64-latest-road-counts-point:station:86",
        sourceId: "cd64-latest-road-counts-point",
        sourceRecordId: "cd64-latest-road-counts-point:fixture:record:0",
        sourceStationId: "64-D810-12+520",
        counterType: "unknown",
        location: {
          type: "Point",
          coordinates: [-1.5434754896, 43.4642264044],
        },
        roadRef: "D810",
      },
      {
        id: "cd64-latest-road-counts-point:fixture:record:0:observation:2022",
        sourceRecordId: "cd64-latest-road-counts-point:fixture:record:0",
        stationId: "cd64-latest-road-counts-point:station:86",
        year: 2022,
        periodType: "annual",
        vehiclesPerDay: 35_551,
        heavyVehiclePercent: 2.66,
        quality: "measured",
        sourceId: "cd64-latest-road-counts-point",
      },
    ]);
  });

  test("does not infer a counter type from dataset-level wording", () => {
    const [station] = normalizeCd64LatestRoadCountRecord(
      sourceRecord({
        annee: "2022",
        voie: "RD 810",
        mja: 35_551,
        id: "86",
      }),
    );
    expect(station).toMatchObject({ counterType: "unknown" });
  });

  test("does not expose the source-local ID as cross-source continuity evidence", () => {
    const [station] = normalizeCd64LatestRoadCountRecord(
      sourceRecord({
        annee: "2022",
        voie: "RD 810",
        mja: 35_551,
        id: "86",
      }),
    );
    expect(station).toMatchObject({
      id: "cd64-latest-road-counts-point:station:86",
    });
    expect(station).not.toHaveProperty("sourceStationId");
  });

  test.each([
    ["invalid year", { annee: "latest", id: "86", mja: 1_000 }],
    ["missing station id", { annee: "2022", mja: 1_000 }],
    ["invalid traffic", { annee: "2022", id: "86", mja: "35551" }],
    ["invalid heavy-vehicle share", { annee: "2022", id: "86", mjappl: 101 }],
  ])("rejects %s", (_label, properties) => {
    expect(() =>
      normalizeCd64LatestRoadCountRecord(sourceRecord(properties)),
    ).toThrow(TrafficNormalizationError);
  });

  test("rejects years outside the source's observed catalogue range", () => {
    expect(() =>
      normalizeCd64LatestRoadCountRecord(
        sourceRecord({ annee: "2024", id: "86", mja: 1_000 }),
      ),
    ).toThrow("annee must be an integer from 2012 through 2022");
  });
});
