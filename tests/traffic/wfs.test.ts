import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { DREAL_TRAFFIC_SOURCES } from "../../src/traffic/source-catalog.js";
import {
  acquireWfsBoundingBoxSample,
  acquireWfsSchema,
  buildWfsBoundingBoxSampleUrl,
  buildWfsDescribeFeatureTypeUrl,
  acquireWfsSample,
  buildWfsSampleUrl,
} from "../../src/traffic/wfs.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "busy-streets-wfs-"));
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

describe("WFS acquisition", () => {
  test("builds the supported GeoJSON sample request", () => {
    const source = DREAL_TRAFFIC_SOURCES[2];

    expect(buildWfsSampleUrl(source, 25)).toBe(
      "https://datacarto.sigena.fr/wfs/5f0e7e36-dc34-4983-903a-e1a27f570d90?service=WFS&version=2.0.0&request=GetFeature&typeNames=ms%3Al_comptage_trafic_p_r75&outputFormat=application%2Fjson%3B+subtype%3Dgeojson&srsName=EPSG%3A4326&count=25",
    );
  });

  test("builds a bounded GeoJSON request for the buffered geographic frame", () => {
    const source = DREAL_TRAFFIC_SOURCES[4];
    const boundingBox = {
      west: -1.58,
      south: 43.45,
      east: -1.53,
      north: 43.51,
    } as const;

    expect(buildWfsBoundingBoxSampleUrl(source, 250, boundingBox)).toBe(
      "https://datacarto.sigena.fr/wfs/c19722dc-3abf-4cb1-a539-eb3d759b202e?service=WFS&version=2.0.0&request=GetFeature&typeNames=ms%3Al_tmja_2024_p_r75&outputFormat=application%2Fjson%3B+subtype%3Dgeojson&srsName=EPSG%3A4326&count=250&bbox=43.45%2C-1.58%2C43.51%2C-1.53%2CEPSG%3A4326",
    );
  });

  test.each([
    { west: -181, south: 43.45, east: -1.53, north: 43.51 },
    { west: -1.58, south: 43.45, east: 181, north: 43.51 },
    { west: -1.53, south: 43.45, east: -1.58, north: 43.51 },
    { west: -1.58, south: 43.51, east: -1.53, north: 43.45 },
    { west: Number.NaN, south: 43.45, east: -1.53, north: 43.51 },
  ])("rejects invalid WGS 84 bounding box $west,$south,$east,$north", (bbox) => {
    expect(() =>
      buildWfsBoundingBoxSampleUrl(DREAL_TRAFFIC_SOURCES[4], 250, bbox),
    ).toThrow("WFS bounding box must be a valid WGS 84 extent");
  });

  test("builds the DescribeFeatureType request for the same WFS layer", () => {
    const source = DREAL_TRAFFIC_SOURCES[2];

    expect(buildWfsDescribeFeatureTypeUrl(source)).toBe(
      "https://datacarto.sigena.fr/wfs/5f0e7e36-dc34-4983-903a-e1a27f570d90?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=ms%3Al_comptage_trafic_p_r75",
    );
  });

  test("rejects unbounded WFS sample sizes", () => {
    const source = DREAL_TRAFFIC_SOURCES[2];

    expect(() => buildWfsSampleUrl(source, 0)).toThrow(
      "WFS sample size must be an integer from 1 through 1000",
    );
    expect(() => buildWfsSampleUrl(source, 1001)).toThrow(
      "WFS sample size must be an integer from 1 through 1000",
    );
  });

  test("stores a WFS sample with its request URL and output CRS", async () => {
    const source = DREAL_TRAFFIC_SOURCES[4];
    const cacheDirectory = await temporaryDirectory();
    const sample = JSON.stringify({
      type: "FeatureCollection",
      features: [],
    });

    const result = await acquireWfsSample(source, {
      cacheDirectory,
      fetch: async () =>
        new Response(sample, {
          headers: { "content-type": "application/json" },
        }),
      now: () => "2026-08-29T13:00:00.000Z",
      sampleSize: 50,
    });

    expect(result.kind).toBe("acquired");
    if (result.kind !== "acquired") return;

    expect(result.artifact.sourceUrl).toBe(buildWfsSampleUrl(source, 50));
    expect(result.artifact.originalFilename).toBe(
      "dreal-2024-point-wfs-sample.geojson",
    );
    expect(result.artifact.crs).toBe("EPSG:4326");
    expect(await readFile(result.localPath, "utf8")).toBe(sample);
  });

  test("stores a bounding-box sample with distinct provenance", async () => {
    const source = DREAL_TRAFFIC_SOURCES[3];
    const cacheDirectory = await temporaryDirectory();
    const boundingBox = {
      west: -1.58,
      south: 43.45,
      east: -1.53,
      north: 43.51,
    } as const;
    const sample = JSON.stringify({
      type: "FeatureCollection",
      features: [],
    });

    const result = await acquireWfsBoundingBoxSample(source, {
      boundingBox,
      cacheDirectory,
      fetch: async () =>
        new Response(sample, {
          headers: { "content-type": "application/json" },
        }),
      now: () => "2026-08-29T15:00:00.000Z",
      sampleSize: 250,
    });

    expect(result.kind).toBe("acquired");
    if (result.kind !== "acquired") return;

    expect(result.artifact.sourceUrl).toBe(
      buildWfsBoundingBoxSampleUrl(source, 250, boundingBox),
    );
    expect(result.artifact.originalFilename).toBe(
      "dreal-2023-linear-wfs-bbox-sample.geojson",
    );
    expect(result.artifact.crs).toBe("EPSG:4326");
    expect(await readFile(result.localPath, "utf8")).toBe(sample);
  });

  test("stores WFS schema evidence as a separate artifact", async () => {
    const source = DREAL_TRAFFIC_SOURCES[4];
    const cacheDirectory = await temporaryDirectory();
    const schema = "<schema xmlns=\"http://www.w3.org/2001/XMLSchema\"/>";

    const result = await acquireWfsSchema(source, {
      cacheDirectory,
      fetch: async () =>
        new Response(schema, { headers: { "content-type": "text/xml" } }),
      now: () => "2026-08-29T13:00:00.000Z",
    });

    expect(result.kind).toBe("acquired");
    if (result.kind !== "acquired") return;

    expect(result.artifact.sourceUrl).toBe(
      buildWfsDescribeFeatureTypeUrl(source),
    );
    expect(result.artifact.originalFilename).toBe(
      "dreal-2024-point-wfs-schema.xsd",
    );
    expect(result.artifact.crs).toBeNull();
    expect(await readFile(result.localPath, "utf8")).toBe(schema);
  });
});
