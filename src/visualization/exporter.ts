import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { AuditEvidenceCollector } from "../traffic/audit-evidence.js";
import type { AuditConfig } from "../traffic/contracts.js";
import { geographicFrameBoundingBox } from "../traffic/geography.js";
import {
  acquireIgnRoads,
  type AcquiredIgnRoads,
  type AcquireIgnRoadsOptions,
} from "../traffic/ign-roads.js";
import {
  buildVisualizationBundle,
  serializeVisualizationBundle,
} from "./bundle.js";
import type { VisualizationBundle } from "./contracts.js";
import { buildStreetSubjects, extractTargetCorridors } from "./street-network.js";

export interface VisualizationExporter {
  export(config: AuditConfig): Promise<VisualizationBundle>;
}

type AcquireRoads = (
  options: AcquireIgnRoadsOptions,
) => Promise<AcquiredIgnRoads>;

export class DefaultVisualizationExporter implements VisualizationExporter {
  constructor(
    private readonly auditCollector: AuditEvidenceCollector,
    private readonly acquireRoads: AcquireRoads = acquireIgnRoads,
  ) {}

  async export(config: AuditConfig): Promise<VisualizationBundle> {
    const audit = await this.auditCollector.collect(config);
    const acquired = await this.acquireRoads({
      bounds: geographicFrameBoundingBox(audit.frame),
      cacheDirectory: config.cacheDirectory,
    });
    const streets = buildStreetSubjects(acquired.segments);
    const targets = extractTargetCorridors(streets);
    const bundle = buildVisualizationBundle({
      audit,
      ignArtifact: acquired.artifact,
      streets,
      targets,
      assignments: [],
    });

    await mkdir(config.outputDirectory, { recursive: true });
    const outputPath = join(config.outputDirectory, "biarritz.json");
    const temporaryPath = `${outputPath}.${process.pid}.tmp`;
    try {
      await writeFile(temporaryPath, serializeVisualizationBundle(bundle));
      await rename(temporaryPath, outputPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
    return bundle;
  }
}
