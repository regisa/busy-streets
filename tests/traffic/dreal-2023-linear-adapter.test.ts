import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type {
  SourceArtifact,
  SourceRecord,
} from "../../src/traffic/contracts.js";
import { phase1TrafficObservationSchema } from "../../src/traffic/contracts.js";
import {
  Dreal2023LinearAdapter,
  normalizeDreal2023LinearRecord,
  TrafficNormalizationError,
} from "../../src/traffic/adapters/dreal-2023-linear.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) result.push(value);
  return result;
}

function artifact(): SourceArtifact {
  return {
    id: "dreal-2023-linear:fixture",
    sourceId: "dreal-2023-linear",
    sourceUrl: "https://example.test/traffic.geojson",
    originalFilename: "traffic.geojson",
    acquiredAt: "2026-08-29T13:00:00.000Z",
    sha256: "fixture",
    byteSize: 1,
    crs: "EPSG:4326",
    adapterVersion: "1",
    license: {
      code: "not-specified",
      label: "Licence not specified",
      url: null,
      redistributionAllowed: false,
      verifiedAt: "2026-08-29",
    },
  };
}

function sourceRecord(
  properties: Readonly<Record<string, unknown>>,
): SourceRecord {
  return {
    id: "dreal-2023-linear:record:segment-1",
    sourceId: "dreal-2023-linear",
    artifactId: "dreal-2023-linear:fixture",
    geometry: {
      type: "LineString",
      coordinates: [
        [-1.56, 43.48],
        [-1.55, 43.49],
      ],
    },
    properties,
  };
}

describe("DREAL 2023 linear adapter", () => {
  test("derives an unknown-quality daily flow from vehicle-kilometres and segment length", () => {
    const evidence = normalizeDreal2023LinearRecord(
      sourceRecord({
        id_ign: "TRONROUT0000000000000001",
        numero: "D810",
        millesime: "2023",
        long_km: 0.5,
        veh_km: 6_172.5,
        pc_pl: 7.25,
      }),
    );

    expect(evidence).toEqual({
      kind: "linear-traffic",
      id: "dreal-2023-linear:line:TRONROUT0000000000000001",
      sourceId: "dreal-2023-linear",
      sourceRecordId: "dreal-2023-linear:record:segment-1",
      geometry: {
        type: "LineString",
        coordinates: [
          [-1.56, 43.48],
          [-1.55, 43.49],
        ],
      },
      roadRef: "D810",
      observation: {
        id: "dreal-2023-linear:record:segment-1:observation:2023",
        sourceRecordId: "dreal-2023-linear:record:segment-1",
        sourceGeometryId: "TRONROUT0000000000000001",
        year: 2023,
        periodType: "annual",
        vehiclesPerDay: 12_345,
        heavyVehiclePercent: 7.25,
        quality: "unknown",
        sourceId: "dreal-2023-linear",
      },
    });
    expect(() =>
      phase1TrafficObservationSchema.parse(evidence.observation),
    ).not.toThrow();
  });

  test("preserves valid MultiLineString geometry", () => {
    const record = {
      ...sourceRecord({
        id_ign: "TRONROUT0000000000000001",
        millesime: "2023",
        long_km: 0.5,
        veh_km: 6_172.5,
        pc_pl: 7.25,
      }),
      geometry: {
        type: "MultiLineString" as const,
        coordinates: [
          [
            [-1.56, 43.48],
            [-1.55, 43.49],
          ],
          [
            [-1.55, 43.49],
            [-1.54, 43.5],
          ],
        ],
      },
    };

    expect(normalizeDreal2023LinearRecord(record).geometry).toEqual(
      record.geometry,
    );
  });

  test("rejects out-of-range WGS 84 line coordinates", () => {
    const record = {
      ...sourceRecord({
        id_ign: "TRONROUT0000000000000001",
        millesime: "2023",
        long_km: 0.5,
        veh_km: 6_172.5,
        pc_pl: 7.25,
      }),
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [500_000, 6_200_000],
          [500_001, 6_200_001],
        ],
      },
    };

    expect(() => normalizeDreal2023LinearRecord(record)).toThrow(
      TrafficNormalizationError,
    );
  });

  test("rejects a non-finite derived daily flow", () => {
    expect(() =>
      normalizeDreal2023LinearRecord(
        sourceRecord({
          id_ign: "TRONROUT0000000000000001",
          millesime: "2023",
          long_km: Number.MIN_VALUE,
          veh_km: Number.MAX_VALUE,
          pc_pl: 7.25,
        }),
      ),
    ).toThrow(TrafficNormalizationError);
  });

  test("preserves a missing heavy-vehicle percentage as null", () => {
    const evidence = normalizeDreal2023LinearRecord(
      sourceRecord({
        id_ign: "TRONROUT0000000000000001",
        numero: "D810",
        millesime: "2023",
        long_km: 0.25,
        veh_km: 2_500,
        pc_pl: null,
      }),
    );

    expect(evidence.observation).toMatchObject({
      vehiclesPerDay: 10_000,
      heavyVehiclePercent: null,
      quality: "unknown",
    });
  });

  test.each([
    ["missing IGN geometry ID", { id_ign: "" }, "missing-geometry-id"],
    ["wrong year", { millesime: "2022" }, "invalid-observation-year"],
    ["zero length", { long_km: 0 }, "invalid-segment-length"],
    ["blank length", { long_km: "" }, "invalid-segment-length"],
    ["blank vehicle-kilometres", { veh_km: "" }, "invalid-traffic-value"],
    ["missing vehicle-kilometres", { veh_km: undefined }, "invalid-traffic-value"],
    ["negative vehicle-kilometres", { veh_km: -1 }, "invalid-traffic-value"],
    ["blank heavy-vehicle share", { pc_pl: "" }, "invalid-traffic-value"],
    ["heavy-vehicle share above 100", { pc_pl: 101 }, "invalid-traffic-value"],
  ])("rejects %s with an attributable issue", (_label, change, code) => {
    try {
      normalizeDreal2023LinearRecord(
        sourceRecord({
          id_ign: "TRONROUT0000000000000001",
          numero: "D810",
          millesime: "2023",
          long_km: 0.5,
          veh_km: 6_172.5,
          pc_pl: 7.25,
          ...change,
        }),
      );
      throw new Error("Expected normalization to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(TrafficNormalizationError);
      expect(error).toMatchObject({
        issue: {
          code,
          severity: "error",
          sourceId: "dreal-2023-linear",
          sourceRecordId: "dreal-2023-linear:record:segment-1",
        },
      });
    }
  });

  test("does not invent a road reference when numero is absent", () => {
    const evidence = normalizeDreal2023LinearRecord(
      sourceRecord({
        id_ign: "TRONROUT0000000000000001",
        millesime: "2023",
        long_km: 0.5,
        veh_km: 6_172.5,
        pc_pl: 7.25,
      }),
    );

    expect(evidence).not.toHaveProperty("roadRef");
  });

  test("normalizes an artifact and continues after an invalid record", async () => {
    const directory = await mkdtemp(join(tmpdir(), "busy-streets-adapter-"));
    temporaryDirectories.push(directory);
    const localPath = join(directory, "traffic.geojson");
    await writeFile(
      localPath,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              id_ign: "invalid",
              millesime: "2023",
              long_km: 0,
              veh_km: 1,
              pc_pl: 2,
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [-1.56, 43.48],
                [-1.55, 43.49],
              ],
            },
          },
          {
            type: "Feature",
            properties: {
              id_ign: "TRONROUT0000000000000001",
              numero: "D810",
              millesime: "2023",
              long_km: 0.5,
              veh_km: 6_172.5,
              pc_pl: 7.25,
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [-1.56, 43.48],
                [-1.55, 43.49],
              ],
            },
          },
        ],
      }),
    );
    const issues: Array<{ readonly code: string }> = [];
    const adapter = new Dreal2023LinearAdapter(
      async () => localPath,
      (issue) => issues.push(issue),
    );

    const evidence = await collect(adapter.normalize(artifact()));

    expect(issues).toMatchObject([{ code: "invalid-segment-length" }]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      kind: "linear-traffic",
      roadRef: "D810",
      observation: { vehiclesPerDay: 12_345, quality: "unknown" },
    });
  });

  test("rejects incompatible source, CRS, and adapter version", async () => {
    const adapter = new Dreal2023LinearAdapter(async () => "/not-used");

    await expect(
      collect(adapter.normalize({ ...artifact(), sourceId: "dreal-2024-linear" })),
    ).rejects.toThrow("cannot normalize dreal-2024-linear");
    await expect(
      collect(adapter.normalize({ ...artifact(), crs: "EPSG:2154" })),
    ).rejects.toThrow("requires EPSG:4326");
    await expect(
      collect(adapter.normalize({ ...artifact(), adapterVersion: "2" })),
    ).rejects.toThrow("requires adapter version 1");
  });
});
