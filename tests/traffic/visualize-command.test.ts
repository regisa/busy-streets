import { join, resolve } from "node:path";

import { describe, expect, test, vi } from "vitest";

import { runTrafficCli } from "../../scripts/traffic/cli.js";
import type { VisualizationExporter } from "../../src/visualization/exporter.js";
import type { VisualizationBundle } from "../../src/visualization/contracts.js";

const emptyBundle = {} as VisualizationBundle;

describe("traffic visualization command", () => {
  test("exports the dated Biarritz visualization bundle", async () => {
    const exportBundle = vi.fn(async () => emptyBundle);
    const visualizationExporter: VisualizationExporter = {
      export: exportBundle,
    };
    const output: string[] = [];
    const errors: string[] = [];

    const exitCode = await runTrafficCli(
      [
        "visualize",
        "--as-of",
        "2026-08-29",
        "--output-dir",
        "tmp/visualization",
      ],
      {
        fetch: globalThis.fetch,
        now: () => "2026-08-30T10:00:00Z",
        stdout: (message) => output.push(message),
        stderr: (message) => errors.push(message),
        visualizationExporter,
      },
    );

    expect(exitCode).toBe(0);
    expect(exportBundle).toHaveBeenCalledWith({
      asOf: "2026-08-29",
      cacheDirectory: resolve(".cache/traffic"),
      outputDirectory: resolve("tmp/visualization"),
      boundaryInseeCode: "64122",
      bufferKilometers: 2,
    });
    expect(output).toEqual([
      `Wrote ${join(resolve("tmp/visualization"), "biarritz.json")}`,
    ]);
    expect(errors).toEqual([]);
  });

  test("requires a valid explicit as-of date", async () => {
    const errors: string[] = [];
    const dependencies = {
      fetch: globalThis.fetch,
      now: () => "2026-08-30T10:00:00Z",
      stdout: () => undefined,
      stderr: (message: string) => errors.push(message),
      visualizationExporter: { export: async () => emptyBundle },
    };

    expect(await runTrafficCli(["visualize"], dependencies)).toBe(1);
    expect(await runTrafficCli(["visualize", "--as-of", "29-08-2026"], dependencies)).toBe(1);
    expect(errors).toEqual([
      "visualize requires --as-of YYYY-MM-DD",
      "visualize --as-of must use YYYY-MM-DD",
    ]);
  });

  test("reports exporter failures without claiming a written bundle", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const exitCode = await runTrafficCli(
      ["visualize", "--as-of", "2026-08-29"],
      {
        fetch: globalThis.fetch,
        now: () => "2026-08-30T10:00:00Z",
        stdout: (message) => output.push(message),
        stderr: (message) => errors.push(message),
        visualizationExporter: {
          export: async () => {
            throw new Error("IGN unavailable");
          },
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(output).toEqual([]);
    expect(errors).toEqual(["IGN unavailable"]);
  });
});
