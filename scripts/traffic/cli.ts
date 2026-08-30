import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  acquireSource,
  registerManualArtifact,
} from "../../src/traffic/acquisition.js";
import {
  enrichInspectionWithWfsSchema,
  inspectArtifact,
  serializeSourceInspection,
} from "../../src/traffic/inspection.js";
import {
  createDefaultAuditEvidenceCollector,
  createDefaultAuditRunner,
} from "../../src/traffic/audit-runner.js";
import type { AuditRunner } from "../../src/traffic/contracts.js";
import { findTrafficSource } from "../../src/traffic/source-catalog.js";
import { acquireWfsSample, acquireWfsSchema } from "../../src/traffic/wfs.js";
import { acquireIgnRoads } from "../../src/traffic/ign-roads.js";
import {
  DefaultVisualizationExporter,
  type VisualizationExporter,
} from "../../src/visualization/exporter.js";

export interface TrafficCliDependencies {
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => string;
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
  readonly auditRunner?: AuditRunner;
  readonly visualizationExporter?: VisualizationExporter;
}

async function runVisualize(
  args: readonly string[],
  dependencies: TrafficCliDependencies,
): Promise<number> {
  const asOf = option(args, "--as-of");
  if (!asOf) throw new Error("visualize requires --as-of YYYY-MM-DD");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error("visualize --as-of must use YYYY-MM-DD");
  }
  const cacheDirectory = resolve(
    option(args, "--cache-dir") ?? ".cache/traffic",
  );
  const outputDirectory = resolve(
    option(args, "--output-dir") ?? "artifacts/traffic/visualization",
  );
  const exporter =
    dependencies.visualizationExporter ??
    new DefaultVisualizationExporter(
      createDefaultAuditEvidenceCollector({
        fetch: dependencies.fetch,
        now: dependencies.now,
      }),
      (options) =>
        acquireIgnRoads({
          ...options,
          fetch: dependencies.fetch,
          now: dependencies.now,
        }),
    );
  await exporter.export({
    asOf,
    cacheDirectory,
    outputDirectory,
    boundaryInseeCode: "64122",
    bufferKilometers: 2,
  });
  dependencies.stdout(`Wrote ${join(outputDirectory, "biarritz.json")}`);
  return 0;
}

function option(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

async function runInspect(
  args: readonly string[],
  dependencies: TrafficCliDependencies,
): Promise<number> {
  const sourceId = option(args, "--source");
  if (!sourceId) throw new Error("inspect requires --source <source-id>");
  const source = findTrafficSource(sourceId);
  if (!source) throw new Error(`Unknown traffic source: ${sourceId}`);

  const cacheDirectory = resolve(
    option(args, "--cache-dir") ?? ".cache/traffic",
  );
  const outputDirectory = resolve(
    option(args, "--output-dir") ?? "artifacts/traffic/inspections",
  );
  const sampleSizeText = option(args, "--sample-size") ?? "100";
  const sampleSize = Number(sampleSizeText);
  if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 1000) {
    throw new Error("--sample-size must be an integer from 1 through 1000");
  }

  const suppliedArtifact = option(args, "--artifact");
  const encoding = option(args, "--encoding") ?? undefined;
  const acquisition = suppliedArtifact
    ? {
        kind: "acquired" as const,
        ...(await registerManualArtifact(source, resolve(suppliedArtifact), {
          cacheDirectory,
          now: dependencies.now,
        })),
      }
    : source.wfs
      ? await acquireWfsSample(source, {
          cacheDirectory,
          fetch: dependencies.fetch,
          now: dependencies.now,
          sampleSize,
        })
      : await acquireSource(source, {
          cacheDirectory,
          fetch: dependencies.fetch,
          now: dependencies.now,
        });
  if (acquisition.kind === "manual-input-required") {
    dependencies.stderr(
      `${source.id} requires manual input: ${acquisition.reason}`,
    );
    return 2;
  }

  let inspection = await inspectArtifact({
    artifact: acquisition.artifact,
    localPath: acquisition.localPath,
    ...(encoding ? { encoding } : {}),
  });
  if (!suppliedArtifact && source.wfs) {
    const schemaAcquisition = await acquireWfsSchema(source, {
      cacheDirectory,
      fetch: dependencies.fetch,
      now: dependencies.now,
    });
    if (schemaAcquisition.kind === "manual-input-required") {
      dependencies.stderr(
        `${source.id} requires manual input: ${schemaAcquisition.reason}`,
      );
      return 2;
    }
    inspection = await enrichInspectionWithWfsSchema(inspection, {
      artifact: schemaAcquisition.artifact,
      localPath: schemaAcquisition.localPath,
    });
  }
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, `${source.id}.inspection.json`);
  await writeFile(outputPath, serializeSourceInspection(inspection));
  dependencies.stdout(`Wrote ${outputPath}`);
  return 0;
}

async function runAudit(
  args: readonly string[],
  dependencies: TrafficCliDependencies,
): Promise<number> {
  const asOf = option(args, "--as-of");
  if (!asOf) throw new Error("audit requires --as-of YYYY-MM-DD");
  const cacheDirectory = resolve(
    option(args, "--cache-dir") ?? ".cache/traffic",
  );
  const outputDirectory = resolve(
    option(args, "--output-dir") ?? "artifacts/traffic/audit",
  );
  const runner =
    dependencies.auditRunner ??
    createDefaultAuditRunner({
      fetch: dependencies.fetch,
      now: dependencies.now,
    });

  await runner.run({
    asOf,
    cacheDirectory,
    outputDirectory,
    boundaryInseeCode: "64122",
    bufferKilometers: 2,
  });
  dependencies.stdout(`Wrote ${join(outputDirectory, "audit-summary.json")}`);
  return 0;
}

export async function runTrafficCli(
  args: readonly string[],
  dependencies: TrafficCliDependencies,
): Promise<number> {
  try {
    const [command, ...commandArgs] = args;
    if (command === "inspect") {
      return await runInspect(commandArgs, dependencies);
    }
    if (command === "audit") {
      return await runAudit(commandArgs, dependencies);
    }
    if (command === "visualize") {
      return await runVisualize(commandArgs, dependencies);
    }
    throw new Error(`Unsupported traffic command: ${command ?? "none"}`);
  } catch (error) {
    dependencies.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && pathToFileURL(resolve(entryPath)).href === import.meta.url) {
  void runTrafficCli(process.argv.slice(2), {
    fetch: globalThis.fetch,
    now: () => new Date().toISOString(),
    stdout: (message) => console.log(message),
    stderr: (message) => console.error(message),
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
