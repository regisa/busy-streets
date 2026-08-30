import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { visualizationBundleSchema } from "../../src/visualization/contracts.js";

const sourcePath = resolve("artifacts/traffic/visualization/biarritz.json");
const outputPath = resolve("data/traffic/biarritz.public.json");
const temporaryPath = `${outputPath}.${process.pid}.tmp`;

const source = await readFile(sourcePath, "utf8");
visualizationBundleSchema.parse(JSON.parse(source));

await mkdir(dirname(outputPath), { recursive: true });
try {
  await writeFile(temporaryPath, source);
  await rename(temporaryPath, outputPath);
} catch (error) {
  await rm(temporaryPath, { force: true });
  throw error;
}

process.stdout.write(`${outputPath}\n`);
