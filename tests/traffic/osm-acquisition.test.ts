import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { Wgs84BoundingBox } from "../../src/traffic/contracts.js";
import {
  OVERPASS_ENDPOINT,
  acquireOsmRoadExtract,
} from "../../src/traffic/osm-acquisition.js";

const temporaryDirectories: string[] = [];
const bounds: Wgs84BoundingBox = {
  west: -1.6,
  south: 43.45,
  east: -1.5,
  north: 43.52,
};
const responseBody = JSON.stringify({
  version: 0.6,
  generator: "Overpass API",
  osm3s: {
    timestamp_osm_base: "2026-08-29T10:00:00Z",
    copyright: "The data included in this document is from www.openstreetmap.org.",
  },
  elements: [],
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "busy-streets-osm-"));
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

describe("OSM road acquisition", () => {
  test("posts one bounded query and records the OSM snapshot and ODbL evidence", async () => {
    const cacheDirectory = await temporaryDirectory();
    const result = await acquireOsmRoadExtract({
      bounds,
      cacheDirectory,
      fetch: async (url, init) => {
        expect(url).toBe(OVERPASS_ENDPOINT);
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        });
        expect(String(init?.body)).toContain(
          "way%5B%22highway%22%5D%2843.45%2C-1.6%2C43.52%2C-1.5%29",
        );
        return new Response(responseBody, {
          headers: { "content-type": "application/json" },
        });
      },
      now: () => "2026-08-29T12:00:00.000Z",
    });

    expect(result.artifact).toMatchObject({
      acquiredAt: "2026-08-29T12:00:00.000Z",
      osmBaseTimestamp: "2026-08-29T10:00:00Z",
      crs: "EPSG:4326",
      parserVersion: "1",
      bounds,
      license: {
        code: "odbl-1.0",
        attribution: "OpenStreetMap contributors",
        redistributionAllowed: true,
        verifiedAt: "2026-08-29",
      },
    });
    expect(result.artifact.sha256).toBe(
      createHash("sha256").update(responseBody).digest("hex"),
    );
    expect(await readFile(result.localPath, "utf8")).toBe(responseBody);
    expect(JSON.parse(await readFile(result.provenancePath, "utf8"))).toEqual(
      result.artifact,
    );
  });

  test("rejects HTML, errors, and JSON without an OSM snapshot", async () => {
    const cacheDirectory = await temporaryDirectory();
    await expect(
      acquireOsmRoadExtract({
        bounds,
        cacheDirectory,
        fetch: async () =>
          new Response("<!doctype html>", {
            headers: { "content-type": "text/html" },
          }),
      }),
    ).rejects.toThrow("HTML");
    await expect(
      acquireOsmRoadExtract({
        bounds,
        cacheDirectory,
        fetch: async () => new Response("busy", { status: 429 }),
      }),
    ).rejects.toThrow("429");
    await expect(
      acquireOsmRoadExtract({
        bounds,
        cacheDirectory,
        fetch: async () =>
          new Response(JSON.stringify({ elements: [] }), {
            headers: { "content-type": "application/json" },
          }),
      }),
    ).rejects.toThrow("timestamp_osm_base");
  });

  test("rejects a partial Overpass response carrying a runtime remark", async () => {
    const cacheDirectory = await temporaryDirectory();
    await expect(
      acquireOsmRoadExtract({
        bounds,
        cacheDirectory,
        fetch: async () =>
          new Response(
            JSON.stringify({
              ...JSON.parse(responseBody),
              remark: "runtime error: Query timed out in dispatcher",
            }),
            { headers: { "content-type": "application/json" } },
          ),
      }),
    ).rejects.toThrow("Query timed out");
  });
});
