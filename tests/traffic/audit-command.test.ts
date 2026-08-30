import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { runTrafficCli } from "../../scripts/traffic/cli.js";
import type {
  AuditConfig,
  AuditRunner,
  AuditSummary,
} from "../../src/traffic/contracts.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "busy-streets-audit-command-"));
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

const summary = {
  schemaVersion: 1,
  asOf: "2026-08-29",
  city: {
    name: "Biarritz",
    inseeCode: "64122",
    boundary: {
      type: "MultiPolygon",
      coordinates: [],
    },
    bufferKilometers: 2,
  },
  sources: [],
  years: [],
  counts: {},
  qualityCounts: {
    measured: 0,
    modeled: 0,
    interpolated: 0,
    unknown: 0,
  },
  issues: [],
  recommendation: "insufficient-open-data",
} satisfies AuditSummary;

describe("traffic audit command", () => {
  test("runs the approved dated Biarritz audit and reports its machine summary", async () => {
    const cacheDirectory = await temporaryDirectory();
    const outputDirectory = await temporaryDirectory();
    const run = vi.fn(async (_config: AuditConfig) => summary);
    const auditRunner: AuditRunner = { run };
    const output: string[] = [];
    const errors: string[] = [];

    const exitCode = await runTrafficCli(
      [
        "audit",
        "--as-of",
        "2026-08-29",
        "--cache-dir",
        cacheDirectory,
        "--output-dir",
        outputDirectory,
      ],
      {
        fetch: globalThis.fetch,
        now: () => "2026-08-30T09:00:00.000Z",
        stdout: (message) => output.push(message),
        stderr: (message) => errors.push(message),
        auditRunner,
      },
    );

    expect(exitCode).toBe(0);
    expect(run).toHaveBeenCalledWith({
      asOf: "2026-08-29",
      cacheDirectory: resolve(cacheDirectory),
      outputDirectory: resolve(outputDirectory),
      boundaryInseeCode: "64122",
      bufferKilometers: 2,
    });
    expect(output).toEqual([
      `Wrote ${join(resolve(outputDirectory), "audit-summary.json")}`,
    ]);
    expect(errors).toEqual([]);
  });

  test("requires an explicit as-of date", async () => {
    const errors: string[] = [];

    const exitCode = await runTrafficCli(["audit"], {
      fetch: globalThis.fetch,
      now: () => "2026-08-30T09:00:00.000Z",
      stdout: () => undefined,
      stderr: (message) => errors.push(message),
      auditRunner: { run: async () => summary },
    });

    expect(exitCode).toBe(1);
    expect(errors).toEqual(["audit requires --as-of YYYY-MM-DD"]);
  });
});
