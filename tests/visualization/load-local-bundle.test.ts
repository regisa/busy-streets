import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadLocalVisualizationBundle } from "../../src/visualization/load-local-bundle.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function temporaryFile(name: string, value: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "busy-streets-bundle-"));
  temporaryDirectories.push(directory);
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(value));
  return path;
}

function validBundle() {
  const ring = [
    [-1.57, 43.47],
    [-1.53, 43.47],
    [-1.53, 43.5],
    [-1.57, 43.5],
    [-1.57, 43.47],
  ];
  const subjects = [
    ["avenue-de-la-gare", "Avenue de la Gare"],
    ["avenue-de-verdun", "Avenue de Verdun"],
  ].map(([id, displayName], index) => ({
    id: `ign-street:${id}:${index}`,
    displayName,
    normalizedName: displayName!.toLowerCase(),
    segmentIds: [String(index)],
    geometry: {
      type: "MultiLineString",
      coordinates: [[[-1.56 + index * 0.01, 43.48], [-1.55 + index * 0.01, 43.48]]],
    },
    vehicleAccess: ["free"],
    evidenceState: "no-data",
  }));
  return {
    schemaVersion: 1,
    asOf: "2026-08-29",
    municipalityInseeCode: "64122",
    bufferKilometers: 2,
    boundary: { type: "MultiPolygon", coordinates: [[[...ring]]] },
    buffer: { type: "Polygon", coordinates: [[...ring]] },
    sources: [],
    stationGroups: [],
    linearRecords: [],
    streetSubjects: subjects,
    targetCorridors: subjects.map((subject, index) => ({
      targetId: index === 0 ? "avenue-de-la-gare" : "avenue-de-verdun",
      streetSubjectIds: [subject.id],
      displayName: subject.displayName,
      reviewStatus: "pending",
    })),
    streetAssignments: [],
    issues: [],
  };
}

describe("local visualization bundle loader", () => {
  test("loads and validates local data in development", async () => {
    const bundle = validBundle();
    const path = await temporaryFile("bundle.json", bundle);

    await expect(
      loadLocalVisualizationBundle({ path, runtime: "development" }),
    ).resolves.toEqual({ status: "ready", bundle });
  });

  test("refuses production before reading a local file", async () => {
    await expect(
      loadLocalVisualizationBundle({
        path: "/not/read/in/production.json",
        runtime: "production",
      }),
    ).resolves.toEqual({ status: "disabled" });
  });

  test("reports a missing expected path", async () => {
    const path = join(tmpdir(), "busy-streets-definitely-missing.json");
    await expect(
      loadLocalVisualizationBundle({ path, runtime: "development" }),
    ).resolves.toEqual({ status: "missing", expectedPath: path });
  });

  test("returns technical validation details for invalid JSON data", async () => {
    const path = await temporaryFile("invalid.json", {
      ...validBundle(),
      municipalityInseeCode: "75056",
    });
    const result = await loadLocalVisualizationBundle({
      path,
      runtime: "test",
    });

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.details.join(" ")).toContain("municipalityInseeCode");
    }
  });

  test("reports malformed JSON as invalid", async () => {
    const directory = await mkdtemp(join(tmpdir(), "busy-streets-bundle-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "malformed.json");
    await writeFile(path, "{not-json");

    const result = await loadLocalVisualizationBundle({
      path,
      runtime: "development",
    });
    expect(result).toEqual({
      status: "invalid",
      details: ["The visualization bundle is not valid JSON"],
    });
  });
});
