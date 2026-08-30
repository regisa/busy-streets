import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { SourceArtifact } from "../../src/traffic/contracts.js";
import { readGeoJsonSourceRecords } from "../../src/traffic/source-records.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "busy-streets-records-"));
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

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) result.push(value);
  return result;
}

describe("GeoJSON source records", () => {
  test("preserves a source feature as an immutable artifact-scoped record", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.geojson");
    await writeFile(
      localPath,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { gid: 1, id_comptag: "79-D14-23+600" },
            geometry: {
              type: "Point",
              coordinates: [0.145242525484892, 46.292030015413673],
            },
          },
        ],
      }),
    );

    const records = await collect(
      readGeoJsonSourceRecords({ artifact: artifact(), localPath }),
    );

    expect(records).toEqual([
      {
        id: "dreal-2024-point:fixture:record:0",
        sourceId: "dreal-2024-point",
        artifactId: "dreal-2024-point:fixture",
        geometry: {
          type: "Point",
          coordinates: [0.145242525484892, 46.292030015413673],
        },
        properties: { gid: 1, id_comptag: "79-D14-23+600" },
      },
    ]);
    expect(Object.isFrozen(records[0])).toBe(true);
    expect(Object.isFrozen(records[0]?.properties)).toBe(true);
    expect(Object.isFrozen(records[0]?.geometry)).toBe(true);
  });

  test("keeps record IDs unique when upstream feature IDs repeat", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.geojson");
    await writeFile(
      localPath,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "station-1",
            properties: { gid: 1 },
            geometry: { type: "Point", coordinates: [0.1, 46.2] },
          },
          {
            type: "Feature",
            id: "station-1",
            properties: { gid: 2 },
            geometry: { type: "Point", coordinates: [0.2, 46.3] },
          },
        ],
      }),
    );

    const records = await collect(
      readGeoJsonSourceRecords({ artifact: artifact(), localPath }),
    );

    expect(records.map((record) => record.id)).toEqual([
      "dreal-2024-point:fixture:record:0",
      "dreal-2024-point:fixture:record:1",
    ]);
    expect(records.map((record) => record.externalId)).toEqual([
      "station-1",
      "station-1",
    ]);
  });

  test("rejects malformed feature properties instead of casting them", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.geojson");
    await writeFile(
      localPath,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: "not-an-object",
            geometry: { type: "Point", coordinates: [0.1, 46.2] },
          },
        ],
      }),
    );

    await expect(
      collect(readGeoJsonSourceRecords({ artifact: artifact(), localPath })),
    ).rejects.toThrow("GeoJSON feature properties must be an object or null");
  });

  test("reports a malformed feature and continues with the next record", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.geojson");
    await writeFile(
      localPath,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: "not-an-object",
            geometry: { type: "Point", coordinates: [0.1, 46.2] },
          },
          {
            type: "Feature",
            properties: { gid: 2 },
            geometry: { type: "Point", coordinates: [0.2, 46.3] },
          },
        ],
      }),
    );
    const issues: Array<{
      readonly code: string;
      readonly sourceRecordId?: string;
    }> = [];

    const records = await collect(
      readGeoJsonSourceRecords(
        { artifact: artifact(), localPath },
        (issue) => issues.push(issue),
      ),
    );

    expect(issues).toMatchObject([
      {
        code: "invalid-source-record",
        sourceRecordId: "dreal-2024-point:fixture:record:0",
      },
    ]);
    expect(records).toMatchObject([
      {
        id: "dreal-2024-point:fixture:record:1",
        properties: { gid: 2 },
      },
    ]);
  });

  test("reports null geometry and continues with the next record", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.geojson");
    await writeFile(
      localPath,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { gid: 1 }, geometry: null },
          {
            type: "Feature",
            properties: { gid: 2 },
            geometry: { type: "Point", coordinates: [0.2, 46.3] },
          },
        ],
      }),
    );
    const issues: Array<{ readonly code: string }> = [];

    const records = await collect(
      readGeoJsonSourceRecords(
        { artifact: artifact(), localPath },
        (issue) => issues.push(issue),
      ),
    );

    expect(issues).toMatchObject([{ code: "invalid-source-record" }]);
    expect(records).toMatchObject([
      { id: "dreal-2024-point:fixture:record:1", properties: { gid: 2 } },
    ]);
  });

  test("reports a non-Feature entry and continues with the next record", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.geojson");
    await writeFile(
      localPath,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Bogus",
            properties: { gid: 1 },
            geometry: { type: "Point", coordinates: [0.1, 46.2] },
          },
          {
            type: "Feature",
            properties: { gid: 2 },
            geometry: { type: "Point", coordinates: [0.2, 46.3] },
          },
        ],
      }),
    );
    const issues: Array<{ readonly code: string }> = [];

    const records = await collect(
      readGeoJsonSourceRecords(
        { artifact: artifact(), localPath },
        (issue) => issues.push(issue),
      ),
    );

    expect(issues).toMatchObject([{ code: "invalid-source-record" }]);
    expect(records).toMatchObject([
      { id: "dreal-2024-point:fixture:record:1", properties: { gid: 2 } },
    ]);
  });
});
