import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type {
  SourceArtifact,
  SourceRecord,
} from "../../src/traffic/contracts.js";
import {
  Dreal2024PointAdapter,
  normalizeDreal2024PointRecord,
  TrafficNormalizationError,
} from "../../src/traffic/adapters/dreal-2024-point.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "busy-streets-adapter-"));
  temporaryDirectories.push(directory);
  return directory;
}

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
    id: "dreal-2024-point:fixture",
    sourceId: "dreal-2024-point",
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
    id: "dreal-2024-point:record:gid:1",
    sourceId: "dreal-2024-point",
    artifactId: "dreal-2024-point:fixture",
    externalId: "79-D14-23+600",
    geometry: {
      type: "Point",
      coordinates: [0.145242525484892, 46.292030015413673],
    },
    properties,
  };
}

describe("DREAL 2024 point adapter", () => {
  test("normalizes a measured rotating-counter observation", () => {
    const record = sourceRecord({
      gid: 1,
      id_comptag: "79-D14-23+600",
      route: "D14",
      type_poste: "tournant",
      tmja_2024: 12_345,
      pc_pl_2024: 7.25,
    });

    expect(normalizeDreal2024PointRecord(record)).toEqual([
      {
        kind: "station",
        id: "dreal-2024-point:station:79-D14-23+600",
        sourceId: "dreal-2024-point",
        sourceRecordId: "dreal-2024-point:record:gid:1",
        sourceStationId: "79-D14-23+600",
        counterType: "rotating",
        location: {
          type: "Point",
          coordinates: [0.145242525484892, 46.292030015413673],
        },
        roadRef: "D14",
      },
      {
        id: "dreal-2024-point:record:gid:1:observation:2024",
        sourceRecordId: "dreal-2024-point:record:gid:1",
        stationId: "dreal-2024-point:station:79-D14-23+600",
        year: 2024,
        periodType: "annual",
        vehiclesPerDay: 12_345,
        heavyVehiclePercent: 7.25,
        quality: "measured",
        sourceId: "dreal-2024-point",
      },
    ]);
  });

  test.each([
    ["permanent", "permanent"],
    ["tournant", "rotating"],
    ["ponctuel", "occasional"],
    ["experimental", "unknown"],
  ] as const)("maps the %s counter type to %s", (sourceType, expected) => {
    const [station] = normalizeDreal2024PointRecord(
      sourceRecord({
        id_comptag: "79-D14-23+600",
        route: "D14",
        type_poste: sourceType,
        tmja_2024: 12_345,
        pc_pl_2024: 7.25,
      }),
    );

    expect(station).toMatchObject({ kind: "station", counterType: expected });
  });

  test("keeps the station but emits no empty observation when traffic is unavailable", () => {
    const evidence = normalizeDreal2024PointRecord(
      sourceRecord({
        id_comptag: "79-D14-23+600",
        route: "D14",
        type_poste: "tournant",
      }),
    );

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      kind: "station",
      id: "dreal-2024-point:station:79-D14-23+600",
    });
  });

  test("turns a blank traffic value into an attributable issue", () => {
    const record = sourceRecord({
      id_comptag: "79-D14-23+600",
      route: "D14",
      type_poste: "tournant",
      tmja_2024: "",
      pc_pl_2024: 7.25,
    });

    try {
      normalizeDreal2024PointRecord(record);
      throw new Error("Expected normalization to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(TrafficNormalizationError);
      expect(error).toMatchObject({
        issue: {
          code: "invalid-traffic-value",
          severity: "error",
          sourceId: "dreal-2024-point",
          sourceRecordId: "dreal-2024-point:record:gid:1",
          message: "tmja_2024 must be a finite non-negative number or null",
        },
      });
    }
  });

  test.each([
    ["negative TMJA", { tmja_2024: -1, pc_pl_2024: 7.25 }],
    ["non-finite TMJA", { tmja_2024: Number.NaN, pc_pl_2024: 7.25 }],
    ["heavy-vehicle share above 100", { tmja_2024: 1000, pc_pl_2024: 100.1 }],
  ])("rejects %s", (_label, traffic) => {
    expect(() =>
      normalizeDreal2024PointRecord(
        sourceRecord({
          id_comptag: "79-D14-23+600",
          route: "D14",
          type_poste: "tournant",
          ...traffic,
        }),
      ),
    ).toThrow(TrafficNormalizationError);
  });

  test("rejects a record without a source station identifier", () => {
    expect(() =>
      normalizeDreal2024PointRecord(
        sourceRecord({
          route: "D14",
          type_poste: "tournant",
          tmja_2024: 12_345,
        }),
      ),
    ).toThrow("id_comptag must be a non-empty string");
  });

  test("does not invent a road reference when the source value is absent", () => {
    const [station] = normalizeDreal2024PointRecord(
      sourceRecord({
        id_comptag: "79-D14-23+600",
        type_poste: "tournant",
        tmja_2024: 12_345,
      }),
    );

    expect(station).not.toHaveProperty("roadRef");
  });

  test("keeps a free-form route as a road name", () => {
    const [station] = normalizeDreal2024PointRecord(
      sourceRecord({
        id_comptag: "BdxMet-avenue de la liberation",
        route: "avenue de la liberation",
        type_poste: "permanent",
        tmja_2024: 12_345,
      }),
    );

    expect(station).toMatchObject({ roadName: "avenue de la liberation" });
    expect(station).not.toHaveProperty("roadRef");
  });

  test("rejects invalid WGS 84 station coordinates", () => {
    const record = {
      ...sourceRecord({
        id_comptag: "79-D14-23+600",
        route: "D14",
        type_poste: "tournant",
        tmja_2024: 12_345,
      }),
      geometry: {
        type: "Point" as const,
        coordinates: [Number.NaN, 46.292],
      },
    };

    expect(() => normalizeDreal2024PointRecord(record)).toThrow(
      TrafficNormalizationError,
    );
  });

  test("rejects a non-numeric extra Point ordinate", () => {
    const record = {
      ...sourceRecord({
        id_comptag: "79-D14-23+600",
        route: "D14",
        type_poste: "tournant",
        tmja_2024: 12_345,
      }),
      geometry: {
        type: "Point" as const,
        coordinates: [0.145, 46.292, "invalid"],
      },
    } as unknown as SourceRecord;

    expect(() => normalizeDreal2024PointRecord(record)).toThrow(
      TrafficNormalizationError,
    );
  });

  test("normalizes records from a resolved GeoJSON artifact", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.geojson");
    await writeFile(
      localPath,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              gid: 1,
              id_comptag: "79-D14-23+600",
              route: "D14",
              type_poste: "permanent",
              tmja_2024: 12_345,
              pc_pl_2024: 7.25,
            },
            geometry: {
              type: "Point",
              coordinates: [0.145242525484892, 46.292030015413673],
            },
          },
        ],
      }),
    );
    const adapter = new Dreal2024PointAdapter(async () => localPath);

    const evidence = await collect(adapter.normalize(artifact()));

    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({
      kind: "station",
      sourceRecordId: "dreal-2024-point:fixture:record:0",
      counterType: "permanent",
    });
    expect(evidence[1]).toMatchObject({
      sourceRecordId: "dreal-2024-point:fixture:record:0",
      year: 2024,
      vehiclesPerDay: 12_345,
      quality: "measured",
    });
  });

  test("inspects the same resolved artifact before normalization", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.geojson");
    await writeFile(
      localPath,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { id_comptag: "79-D14-23+600", tmja_2024: 12_345 },
            geometry: { type: "Point", coordinates: [0.145, 46.292] },
          },
        ],
      }),
    );
    const adapter = new Dreal2024PointAdapter(async () => localPath);

    await expect(adapter.inspect(artifact())).resolves.toMatchObject({
      sourceId: "dreal-2024-point",
      artifactId: "dreal-2024-point:fixture",
      geometryTypes: ["Point"],
      crs: "EPSG:4326",
      recordCount: 1,
    });
  });

  test("reports an invalid record and continues with later source records", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.geojson");
    await writeFile(
      localPath,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              id_comptag: "79-D14-23+600",
              route: "D14",
              type_poste: "tournant",
              tmja_2024: "",
            },
            geometry: { type: "Point", coordinates: [0.145, 46.292] },
          },
          {
            type: "Feature",
            properties: {
              id_comptag: "16-N10-53+500",
              route: "N10",
              type_poste: "permanent",
              tmja_2024: 48_347,
              pc_pl_2024: 22.82,
            },
            geometry: { type: "Point", coordinates: [0.115, 45.633] },
          },
        ],
      }),
    );
    const issues: Array<{ readonly code: string }> = [];
    const adapter = new Dreal2024PointAdapter(
      async () => localPath,
      (issue) => issues.push(issue),
    );

    const evidence = await collect(adapter.normalize(artifact()));

    expect(issues).toMatchObject([{ code: "invalid-traffic-value" }]);
    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({
      kind: "station",
      sourceStationId: "16-N10-53+500",
    });
    expect(evidence[1]).toMatchObject({
      vehiclesPerDay: 48_347,
      quality: "measured",
    });
  });

  test("rejects an artifact from another source", async () => {
    const adapter = new Dreal2024PointAdapter(async () => "/not-used");

    await expect(
      collect(
        adapter.normalize({
          ...artifact(),
          sourceId: "dreal-2019-2023-point",
        }),
      ),
    ).rejects.toThrow(
      "DREAL 2024 point adapter cannot normalize dreal-2019-2023-point",
    );
  });

  test.each([
    ["unexpected CRS", { crs: "EPSG:2154" }, "requires EPSG:4326"],
    ["unexpected adapter version", { adapterVersion: "2" }, "requires adapter version 1"],
  ] as const)("rejects an artifact with %s", async (_label, change, message) => {
    const adapter = new Dreal2024PointAdapter(async () => "/not-used");

    await expect(
      collect(adapter.normalize({ ...artifact(), ...change })),
    ).rejects.toThrow(message);
  });
});
