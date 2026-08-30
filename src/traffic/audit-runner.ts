import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { MultiPolygon } from "geojson";

import type {
  AuditConfig,
  AuditIssue,
  AuditRunner,
  AuditSummary,
  BiarritzGeographicFrame,
  GeographicEvidence,
  GeographicTrafficObservation,
  GeographicTrafficStation,
  SourceDefinition,
  SourceAuditStatus,
} from "./contracts.js";
import { acquireSource } from "./acquisition.js";
import { createTrafficSourceAdapter } from "./adapters/registry.js";
import { buildAuditSummary, serializeAuditSummary } from "./audit-summary.js";
import { applyBiarritzGeographicFrame } from "./geographic-evidence.js";
import { acquireBiarritzBoundary } from "./geography-acquisition.js";
import {
  createBiarritzGeographicFrame,
  geographicFrameBoundingBox,
} from "./geography.js";
import { enrichInspectionWithWfsSchema } from "./inspection.js";
import { acquireOsmRoadExtract } from "./osm-acquisition.js";
import { createOsmMatchabilityProbe } from "./osm-matchability.js";
import { parseOverpassRoads, type OsmRoad } from "./osm-roads.js";
import {
  reconcileTrafficObservations,
  type ReconciledTrafficObservation,
} from "./reconciliation.js";
import { findStationContinuityCandidates } from "./station-continuity.js";
import { TRAFFIC_SOURCES } from "./source-catalog.js";
import {
  acquireWfsBoundingBoxSample,
  acquireWfsSchema,
} from "./wfs.js";

export interface LoadedAuditSources {
  readonly sources: readonly SourceAuditStatus[];
  readonly evidence: readonly GeographicEvidence[];
  readonly issues: readonly AuditIssue[];
}

export interface LoadedOsmRoads {
  readonly artifactId: string;
  readonly sha256: string;
  readonly osmBaseTimestamp: string;
  readonly roads: readonly OsmRoad[];
}

export interface AuditRunnerDependencies {
  readonly loadBoundary: (config: AuditConfig) => Promise<MultiPolygon>;
  readonly loadSources: (
    config: AuditConfig,
    frame: BiarritzGeographicFrame,
  ) => Promise<LoadedAuditSources>;
  readonly loadOsmRoads: (
    config: AuditConfig,
    frame: BiarritzGeographicFrame,
  ) => Promise<LoadedOsmRoads | null>;
}

export interface DefaultAuditRunnerOptions {
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => string;
}

export function createDefaultAuditRunner(
  options: DefaultAuditRunnerOptions,
): TrafficAuditRunner {
  return new TrafficAuditRunner({
    loadBoundary: async (config) =>
      (
        await acquireBiarritzBoundary({
          cacheDirectory: config.cacheDirectory,
          fetch: options.fetch,
          now: options.now,
        })
      ).boundary,
    loadSources: (config, frame) => loadOfficialSources(config, frame, options),
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
  constructor(private readonly dependencies: AuditRunnerDependencies) {}

  async run(config: AuditConfig): Promise<AuditSummary> {
    validateConfig(config);
    const boundary = await this.dependencies.loadBoundary(config);
    const frame = createBiarritzGeographicFrame(boundary);
    const loaded = await this.dependencies.loadSources(config, frame);
    const stations = loaded.evidence.filter(isStation);
    const inScopeStations = stations.filter(
      (station) => station.geographicScope !== "outside",
    );
    const observations = loaded.evidence.filter(isPointObservation);
    const continuityCandidates = findStationContinuityCandidates(inScopeStations);
    const subjects = comparisonSubjects(inScopeStations, continuityCandidates);
    const reconciledObservations = reconcileTrafficObservations(
      observations.flatMap((observation) => {
        const stationId = observation.stationId;
        if (!stationId) return [];
        const subjectId = subjects.get(stationId);
        return subjectId ? [{ subjectId, observation }] : [];
      }),
    );
    const loadedOsm = await this.dependencies.loadOsmRoads(config, frame);
    const osmMatchabilityProbe = loadedOsm
      ? createOsmMatchabilityProbe(
          {
            artifactId: loadedOsm.artifactId,
            sha256: loadedOsm.sha256,
            osmBaseTimestamp: loadedOsm.osmBaseTimestamp,
          },
          inScopeStations,
          loadedOsm.roads,
        )
      : null;
    const summary = buildAuditSummary({
      asOf: config.asOf,
      boundary,
      sources: loaded.sources,
      evidence: loaded.evidence,
      reconciledObservations,
      continuityCandidates,
      osmMatchabilityProbe,
      issues: loaded.issues,
      recommendation: recommend(reconciledObservations),
    });

    await mkdir(config.outputDirectory, { recursive: true });
    await writeFile(
      join(config.outputDirectory, "audit-summary.json"),
      serializeAuditSummary(summary),
    );
    return summary;
  }
}

function validateConfig(config: AuditConfig): void {
  if (config.boundaryInseeCode !== "64122") {
    throw new Error("Phase 1 requires Biarritz INSEE code 64122");
  }
  if (config.bufferKilometers !== 2) {
    throw new Error("Phase 1 requires the approved 2 km buffer");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.asOf)) {
    throw new Error("Audit as-of date must use YYYY-MM-DD");
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

function isStation(
  evidence: GeographicEvidence,
): evidence is GeographicTrafficStation {
  return "kind" in evidence && evidence.kind === "station";
}

function isPointObservation(
  evidence: GeographicEvidence,
): evidence is GeographicTrafficObservation {
  return !("kind" in evidence);
}

function comparisonSubjects(
  stations: readonly GeographicTrafficStation[],
  candidates: ReturnType<typeof findStationContinuityCandidates>,
): ReadonlyMap<string, string> {
  const parents = new Map(stations.map((station) => [station.id, station.id]));

  const find = (stationId: string): string => {
    const parent = parents.get(stationId);
    if (!parent) throw new Error(`Unknown continuity station: ${stationId}`);
    if (parent === stationId) return parent;
    const root = find(parent);
    parents.set(stationId, root);
    return root;
  };
  const union = (leftStationId: string, rightStationId: string): void => {
    const leftRoot = find(leftStationId);
    const rightRoot = find(rightStationId);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort((left, right) =>
      left.localeCompare(right),
    );
    parents.set(second!, first!);
  };

  for (const candidate of candidates) {
    if (candidate.classification === "probable") {
      union(candidate.leftStationId, candidate.rightStationId);
    }
  }

  const groups = new Map<string, string[]>();
  for (const station of stations) {
    const root = find(station.id);
    const group = groups.get(root) ?? [];
    group.push(station.id);
    groups.set(root, group);
  }

  const subjects = new Map<string, string>();
  for (const stationIds of groups.values()) {
    stationIds.sort((left, right) => left.localeCompare(right));
    const subjectId = `station-group:${stationIds.join("|")}`;
    for (const stationId of stationIds) subjects.set(stationId, subjectId);
  }
  return subjects;
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
