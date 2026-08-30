import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  BIARRITZ_BOUNDARY_URL,
  acquireBiarritzBoundary,
} from "../../src/traffic/geography-acquisition.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "busy-streets-geography-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

const officialBoundaryBody = JSON.stringify({
  type: "Feature",
  properties: { code: "64122", nom: "Biarritz" },
  geometry: {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [-1.56, 43.47],
          [-1.55, 43.47],
          [-1.55, 43.48],
          [-1.56, 43.48],
          [-1.56, 43.47],
        ],
      ],
    ],
  },
});

describe("Biarritz boundary acquisition", () => {
  test("stores the validated official response in a content-addressed cache", async () => {
    const cacheDirectory = await temporaryDirectory();
    const result = await acquireBiarritzBoundary({
      cacheDirectory,
      fetch: async (url) => {
        expect(url).toBe(BIARRITZ_BOUNDARY_URL);
        return new Response(officialBoundaryBody, {
          headers: { "content-type": "application/geo+json" },
        });
      },
      now: () => "2026-08-29T12:00:00.000Z",
    });

    expect(result.artifact).toMatchObject({
      inseeCode: "64122",
      sourceUrl: BIARRITZ_BOUNDARY_URL,
      acquiredAt: "2026-08-29T12:00:00.000Z",
      crs: "EPSG:4326",
      schemaVersion: 1,
      adapterVersion: "1",
      license: {
        code: "odbl-1.0",
        redistributionAllowed: true,
        verifiedAt: "2026-08-29",
      },
    });
    expect(result.localPath).toContain(result.artifact.sha256);
    expect(await readFile(result.localPath, "utf8")).toBe(officialBoundaryBody);
    expect(JSON.parse(await readFile(result.provenancePath, "utf8"))).toEqual(
      result.artifact,
    );
    expect(result.boundary.type).toBe("MultiPolygon");
  });

  test("rejects HTML and non-success responses", async () => {
    const cacheDirectory = await temporaryDirectory();

    await expect(
      acquireBiarritzBoundary({
        cacheDirectory,
        fetch: async () =>
          new Response("<!doctype html>", {
            headers: { "content-type": "text/html" },
          }),
      }),
    ).rejects.toThrow("HTML");

    await expect(
      acquireBiarritzBoundary({
        cacheDirectory,
        fetch: async () => new Response("Unavailable", { status: 503 }),
      }),
    ).rejects.toThrow("503");
  });

  test("repairs a corrupt file already present at the checksum path", async () => {
    const cacheDirectory = await temporaryDirectory();
    const checksum = createHash("sha256")
      .update(officialBoundaryBody)
      .digest("hex");
    const artifactDirectory = join(
      cacheDirectory,
      "geography",
      "64122",
      checksum,
    );
    const localPath = join(artifactDirectory, "biarritz-64122.geojson");
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(localPath, "corrupt");

    const result = await acquireBiarritzBoundary({
      cacheDirectory,
      fetch: async () =>
        new Response(officialBoundaryBody, {
          headers: { "content-type": "application/geo+json" },
        }),
    });

    expect(result.localPath).toBe(localPath);
    expect(await readFile(localPath, "utf8")).toBe(officialBoundaryBody);
  });
});
