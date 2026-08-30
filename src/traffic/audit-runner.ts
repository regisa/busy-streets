import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  AuditConfig,
  AuditIssue,
  AuditRunner,
  AuditSummary,
  BiarritzGeographicFrame,
  GeographicEvidence,
  SourceDefinition,
  SourceAuditStatus,
} from "./contracts.js";
import { acquireSource } from "./acquisition.js";
import { createTrafficSourceAdapter } from "./adapters/registry.js";
import {
  TrafficAuditEvidenceCollector,
  type AuditEvidenceCollector,
  type LoadedAuditSources,
} from "./audit-evidence.js";
import { buildAuditSummary, serializeAuditSummary } from "./audit-summary.js";
import { applyBiarritzGeographicFrame } from "./geographic-evidence.js";
import { acquireBiarritzBoundary } from "./geography-acquisition.js";
import {
  geographicFrameBoundingBox,
} from "./geography.js";
import { enrichInspectionWithWfsSchema } from "./inspection.js";
import { acquireOsmRoadExtract } from "./osm-acquisition.js";
import { parseOverpassRoads } from "./osm-roads.js";
import type { ReconciledTrafficObservation } from "./reconciliation.js";
import { TRAFFIC_SOURCES } from "./source-catalog.js";
import {
  acquireWfsBoundingBoxSample,
  acquireWfsSchema,
} from "./wfs.js";

export interface DefaultAuditRunnerOptions {
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => string;
}

export function createDefaultAuditRunner(
  options: DefaultAuditRunnerOptions,
): TrafficAuditRunner {
  return new TrafficAuditRunner(createDefaultAuditEvidenceCollector(options));
}

export function createDefaultAuditEvidenceCollector(
  options: DefaultAuditRunnerOptions,
): TrafficAuditEvidenceCollector {
  return new TrafficAuditEvidenceCollector({
      loadBoundary: async (config) =>
        (
          await acquireBiarritzBoundary({
            cacheDirectory: config.cacheDirectory,
            fetch: options.fetch,
            now: options.now,
          })
        ).boundary,
      loadSources: (config, frame) =>
        loadOfficialSources(config, frame, options),
      loadOsmRoads: async (config, frame) => {
        const acquired = await acquireOsmRoadExtract({
          bounds: geographicFrameBoundingBox(frame),
          cacheDirectory: config.cacheDirectory,
          fetch: options.fetch,
          now: options.now,
        });
        const parsed = parseOverpassRoads(
          JSON.parse(await readFile(acquired.localPath, "utf8")),
        );
        return {
          artifactId: acquired.artifact.id,
          sha256: acquired.artifact.sha256,
          osmBaseTimestamp: acquired.artifact.osmBaseTimestamp,
          roads: parsed.roads,
        };
      },
    });
}

export class TrafficAuditRunner implements AuditRunner {
  constructor(private readonly collector: AuditEvidenceCollector) {}

  async run(config: AuditConfig): Promise<AuditSummary> {
    const snapshot = await this.collector.collect(config);
    const summary = buildAuditSummary({
      asOf: config.asOf,
      boundary: snapshot.frame.boundary,
      sources: snapshot.sources,
      evidence: snapshot.evidence,
      reconciledObservations: snapshot.reconciledObservations,
      continuityCandidates: snapshot.continuityCandidates,
      osmMatchabilityProbe: snapshot.osmMatchabilityProbe,
      issues: snapshot.issues,
      recommendation: recommend(snapshot.reconciledObservations),
    });

    await mkdir(config.outputDirectory, { recursive: true });
    await writeFile(
      join(config.outputDirectory, "audit-summary.json"),
      serializeAuditSummary(summary),
    );
    return summary;
  }
}

async function loadOfficialSources(
  config: AuditConfig,
  frame: BiarritzGeographicFrame,
  options: DefaultAuditRunnerOptions,
): Promise<LoadedAuditSources> {
  const sources: SourceAuditStatus[] = [];
  const evidence: GeographicEvidence[] = [];
  const issues: AuditIssue[] = [];
  const reportIssue = (issue: AuditIssue): void => {
    issues.push(issue);
  };
  const boundingBox = geographicFrameBoundingBox(frame);

  for (const source of TRAFFIC_SOURCES as readonly SourceDefinition[]) {
    const supportsSource =
      createTrafficSourceAdapter(
        source.id,
        async () => {
          throw new Error("Adapter path is not available before acquisition");
        },
        reportIssue,
      ) !== null;
    if (!supportsSource) {
      sources.push({
        sourceId: source.id,
        status: "blocked",
        blockedReason: "Adapter not implemented",
      });
      continue;
    }

    try {
      const acquisition = source.wfs
        ? await acquireWfsBoundingBoxSample(source, {
            boundingBox,
            cacheDirectory: config.cacheDirectory,
            fetch: options.fetch,
            now: options.now,
            sampleSize: 1000,
          })
        : await acquireSource(source, {
            cacheDirectory: config.cacheDirectory,
            fetch: options.fetch,
            now: options.now,
          });
      if (acquisition.kind === "manual-input-required") {
        sources.push({
          sourceId: source.id,
          status: "blocked",
          blockedReason: acquisition.reason,
        });
        continue;
      }

      const adapter = createTrafficSourceAdapter(
        source.id,
        async (artifact) => {
          if (artifact.id !== acquisition.artifact.id) {
            throw new Error(`No local path registered for ${artifact.id}`);
          }
          return acquisition.localPath;
        },
        reportIssue,
      );
      if (!adapter) throw new Error(`Adapter not implemented for ${source.id}`);
      let inspection = await adapter.inspect(acquisition.artifact);
      if (source.wfs) {
        try {
          const schemaAcquisition = await acquireWfsSchema(source, {
            cacheDirectory: config.cacheDirectory,
            fetch: options.fetch,
            now: options.now,
          });
          if (schemaAcquisition.kind === "acquired") {
            inspection = await enrichInspectionWithWfsSchema(inspection, {
              artifact: schemaAcquisition.artifact,
              localPath: schemaAcquisition.localPath,
            });
          } else {
            reportIssue({
              code: "source-schema-unavailable",
              severity: "warning",
              sourceId: source.id,
              message: schemaAcquisition.reason,
            });
          }
        } catch (error) {
          reportIssue({
            code: "source-schema-unavailable",
            severity: "warning",
            sourceId: source.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (inspection.recordCount === 1000) {
        reportIssue({
          code: "source-sample-limit-reached",
          severity: "error",
          sourceId: source.id,
          message:
            "The bounded WFS response reached the 1,000-record limit and may be incomplete",
        });
      }

      const normalized: GeographicEvidence[] = [];
      const normalizedSource = adapter.normalize(acquisition.artifact);
      for await (const item of applyBiarritzGeographicFrame(
        normalizedSource,
        frame,
        reportIssue,
      )) {
        normalized.push(item);
      }
      evidence.push(...normalized);
      sources.push({
        sourceId: source.id,
        status: "audited",
        artifactId: acquisition.artifact.id,
        inspection,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reportIssue({
        code: "source-audit-failed",
        severity: "error",
        sourceId: source.id,
        message,
      });
      sources.push({
        sourceId: source.id,
        status: "blocked",
        blockedReason: message,
      });
    }
  }

  return { sources, evidence, issues };
}

function recommend(
  observations: readonly ReconciledTrafficObservation[],
): AuditSummary["recommendation"] {
  const measuredYearsBySubject = new Map<string, Set<number>>();
  for (const observation of observations) {
    if (
      observation.canonical?.quality !== "measured" ||
      observation.canonical.vehiclesPerDay === null
    ) {
      continue;
    }
    const years = measuredYearsBySubject.get(observation.subjectId) ?? new Set();
    years.add(observation.year);
    measuredYearsBySubject.set(observation.subjectId, years);
  }
  return [...measuredYearsBySubject.values()].some((years) => years.size >= 2)
    ? "limited-corridor-or-station-explorer"
    : "insufficient-open-data";
}
