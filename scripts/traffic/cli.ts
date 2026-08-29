import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { registerManualArtifact } from "../../src/traffic/acquisition.js";
import {
  enrichInspectionWithWfsSchema,
  inspectArtifact,
  serializeSourceInspection,
} from "../../src/traffic/inspection.js";
import { findTrafficSource } from "../../src/traffic/source-catalog.js";
import { acquireWfsSample, acquireWfsSchema } from "../../src/traffic/wfs.js";

export interface TrafficCliDependencies {
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => string;
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
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
    : await acquireWfsSample(source, {
        cacheDirectory,
        fetch: dependencies.fetch,
        now: dependencies.now,
        sampleSize,
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
  if (!suppliedArtifact) {
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

export async function runTrafficCli(
  args: readonly string[],
  dependencies: TrafficCliDependencies,
): Promise<number> {
  try {
    const [command, ...commandArgs] = args;
    if (command !== "inspect") {
      throw new Error(`Unsupported traffic command: ${command ?? "none"}`);
    }
    return await runInspect(commandArgs, dependencies);
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
