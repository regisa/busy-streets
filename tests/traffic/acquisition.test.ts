import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  acquireSource,
  registerManualArtifact,
} from "../../src/traffic/acquisition.js";
import { DREAL_TRAFFIC_SOURCES } from "../../src/traffic/source-catalog.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "busy-streets-acquisition-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("source acquisition", () => {
  test("requires manual input when an official resource returns HTML", async () => {
    const source = DREAL_TRAFFIC_SOURCES[2];
    const cacheDirectory = await temporaryDirectory();

    const result = await acquireSource(source, {
      cacheDirectory,
      fetch: async () =>
        new Response("<!doctype html><title>Download application</title>", {
          headers: { "content-type": "text/html" },
          status: 200,
        }),
      now: () => "2026-08-29T10:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "manual-input-required",
      sourceId: "dreal-2019-2023-point",
      reason: "official resource returned HTML instead of a data artifact",
      expectedFormats: ["zip", "shp"],
    });
  });

  test("stores identical automatic downloads at the same checksum path", async () => {
    const source = DREAL_TRAFFIC_SOURCES[0];
    const cacheDirectory = await temporaryDirectory();
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    const fetch = async () =>
      new Response(bytes, {
        headers: {
          "content-disposition": 'attachment; filename="traffic.zip"',
          "content-type": "application/zip",
        },
      });

    const first = await acquireSource(source, {
      cacheDirectory,
      fetch,
      now: () => "2026-08-29T10:00:00.000Z",
    });
    const second = await acquireSource(source, {
      cacheDirectory,
      fetch,
      now: () => "2026-08-30T10:00:00.000Z",
    });

    expect(first.kind).toBe("acquired");
    expect(second.kind).toBe("acquired");
    if (first.kind !== "acquired" || second.kind !== "acquired") return;

    expect(second.artifact.id).toBe(first.artifact.id);
    expect(second.localPath).toBe(first.localPath);
    expect(new Uint8Array(await readFile(first.localPath))).toEqual(bytes);
  });

  test("registers a manual file with its source provenance", async () => {
    const source = DREAL_TRAFFIC_SOURCES[4];
    const cacheDirectory = await temporaryDirectory();
    const suppliedDirectory = await temporaryDirectory();
    const suppliedPath = join(suppliedDirectory, "linear-2024.zip");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(suppliedPath, new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9]));

    const result = await registerManualArtifact(source, suppliedPath, {
      cacheDirectory,
      now: () => "2026-08-29T10:00:00.000Z",
    });

    expect(result.artifact.sourceId).toBe("dreal-2024-linear");
    expect(result.artifact.sourceUrl).toBe(source.datasetUrl);
    expect(result.artifact.originalFilename).toBe("linear-2024.zip");
    expect(result.artifact).toHaveProperty("license", source.license);
    expect(result.localPath).toContain(result.artifact.sha256);
  });
});
