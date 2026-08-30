import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type {
  SourceArtifact,
  SourceRecord,
} from "../../src/traffic/contracts.js";
import {
  Dreal2019To2023PointAdapter,
  normalizeDreal2019To2023PointRecord,
  TrafficNormalizationError,
} from "../../src/traffic/adapters/dreal-2019-2023-point.js";

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
    id: "dreal-2019-2023-point:fixture",
    sourceId: "dreal-2019-2023-point",
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
    id: "dreal-2019-2023-point:record:station-1",
    sourceId: "dreal-2019-2023-point",
    artifactId: "dreal-2019-2023-point:fixture",
    geometry: {
      type: "Point",
      coordinates: [-1.558, 43.483],
    },
    properties,
  };
}

describe("DREAL 2019-2023 point adapter", () => {
  test("normalizes each available measured annual value without filling gaps", () => {
    const evidence = normalizeDreal2019To2023PointRecord(
      sourceRecord({
        id_comptag: "64-D810-10+200",
        route: "D810",
        type_poste: "permanent",
        tmja_2019: 12_019,
        pc_pl_2019: 5.9,
        tmja_2021: 12_021,
        tmja_2023: 12_023,
        pc_pl_2023: 6.3,
      }),
    );

    expect(evidence).toEqual([
      {
        kind: "station",
        id: "dreal-2019-2023-point:station:64-D810-10+200",
        sourceId: "dreal-2019-2023-point",
        sourceRecordId: "dreal-2019-2023-point:record:station-1",
        sourceStationId: "64-D810-10+200",
        counterType: "permanent",
        location: { type: "Point", coordinates: [-1.558, 43.483] },
        roadRef: "D810",
      },
      {
        id: "dreal-2019-2023-point:record:station-1:observation:2019",
        sourceRecordId: "dreal-2019-2023-point:record:station-1",
        stationId: "dreal-2019-2023-point:station:64-D810-10+200",
        year: 2019,
        periodType: "annual",
        vehiclesPerDay: 12_019,
        heavyVehiclePercent: 5.9,
        quality: "measured",
        sourceId: "dreal-2019-2023-point",
      },
      {
        id: "dreal-2019-2023-point:record:station-1:observation:2021",
        sourceRecordId: "dreal-2019-2023-point:record:station-1",
        stationId: "dreal-2019-2023-point:station:64-D810-10+200",
        year: 2021,
        periodType: "annual",
        vehiclesPerDay: 12_021,
        heavyVehiclePercent: null,
        quality: "measured",
        sourceId: "dreal-2019-2023-point",
      },
      {
        id: "dreal-2019-2023-point:record:station-1:observation:2023",
        sourceRecordId: "dreal-2019-2023-point:record:station-1",
        stationId: "dreal-2019-2023-point:station:64-D810-10+200",
        year: 2023,
        periodType: "annual",
        vehiclesPerDay: 12_023,
        heavyVehiclePercent: 6.3,
        quality: "measured",
        sourceId: "dreal-2019-2023-point",
      },
    ]);
  });

  test.each([
    ["permanent", "permanent"],
    ["tournant", "rotating"],
    ["ponctuel", "occasional"],
    ["experimental", "unknown"],
  ] as const)("maps the %s counter type to %s", (sourceType, expected) => {
    const [station] = normalizeDreal2019To2023PointRecord(
      sourceRecord({
        id_comptag: "64-D810-10+200",
        type_poste: sourceType,
      }),
    );

    expect(station).toMatchObject({ kind: "station", counterType: expected });
  });

  test("keeps a free-form route as a road name", () => {
    const [station] = normalizeDreal2019To2023PointRecord(
      sourceRecord({
        id_comptag: "BdxMet-pont saint jean",
        route: "pont saint jean",
        type_poste: "permanent",
      }),
    );

    expect(station).toMatchObject({ roadName: "pont saint jean" });
    expect(station).not.toHaveProperty("roadRef");
  });

  test.each([
    ["blank TMJA", { tmja_2020: "" }],
    ["negative TMJA", { tmja_2020: -1 }],
    ["non-finite TMJA", { tmja_2020: Number.NaN }],
    ["heavy-vehicle share above 100", { pc_pl_2020: 100.1 }],
  ])("rejects %s as an attributable issue", (_label, traffic) => {
    try {
      normalizeDreal2019To2023PointRecord(
        sourceRecord({ id_comptag: "64-D810-10+200", ...traffic }),
      );
      throw new Error("Expected normalization to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(TrafficNormalizationError);
      expect(error).toMatchObject({
        issue: {
          code: "invalid-traffic-value",
          severity: "error",
          sourceId: "dreal-2019-2023-point",
          sourceRecordId: "dreal-2019-2023-point:record:station-1",
        },
      });
    }
  });

  test("rejects a missing station identifier", () => {
    expect(() =>
      normalizeDreal2019To2023PointRecord(sourceRecord({ tmja_2019: 1_000 })),
    ).toThrow("id_comptag must be a non-empty string");
  });

  test("rejects invalid WGS 84 coordinates", () => {
    const record = {
      ...sourceRecord({ id_comptag: "64-D810-10+200" }),
      geometry: { type: "Point" as const, coordinates: [-1.558, 143.483] },
    };

    expect(() => normalizeDreal2019To2023PointRecord(record)).toThrow(
      TrafficNormalizationError,
    );
  });

  test("normalizes an artifact and continues after an invalid feature", async () => {
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
              tmja_2019: 10_000,
            },
            geometry: { type: "Point", coordinates: [-1.56, 43.48] },
          },
          {
            type: "Feature",
            properties: {
              id_comptag: "64-D810-10+200",
              route: "D810",
              type_poste: "tournant",
              tmja_2019: 20_000,
              pc_pl_2019: 6.5,
              tmja_2021: "",
              tmja_2023: 22_000,
            },
            geometry: { type: "Point", coordinates: [-1.558, 43.483] },
          },
        ],
      }),
    );
    const issues: Array<{ readonly code: string }> = [];
    const adapter = new Dreal2019To2023PointAdapter(
      async () => localPath,
      (issue) => issues.push(issue),
    );

    const evidence = await collect(adapter.normalize(artifact()));

    expect(issues).toMatchObject([
      { code: "missing-station-id" },
      { code: "invalid-traffic-value" },
    ]);
    expect(evidence).toHaveLength(3);
    expect(evidence[0]).toMatchObject({
      kind: "station",
      sourceStationId: "64-D810-10+200",
    });
    expect(evidence.slice(1)).toMatchObject([
      { year: 2019, quality: "measured" },
      { year: 2023, quality: "measured" },
    ]);
  });

  test("rejects incompatible source, CRS, and adapter version", async () => {
    const adapter = new Dreal2019To2023PointAdapter(async () => "/not-used");

    await expect(
      collect(adapter.normalize({ ...artifact(), sourceId: "dreal-2024-point" })),
    ).rejects.toThrow("cannot normalize dreal-2024-point");
    await expect(
      collect(adapter.normalize({ ...artifact(), crs: "EPSG:2154" })),
    ).rejects.toThrow("requires EPSG:4326");
    await expect(
      collect(adapter.normalize({ ...artifact(), adapterVersion: "2" })),
    ).rejects.toThrow("requires adapter version 1");
  });
});
