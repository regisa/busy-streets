import type { MultiPolygon } from "geojson";

import type {
  AuditConfig,
  AuditIssue,
  BiarritzGeographicFrame,
  ContinuityCandidate,
  GeographicEvidence,
  GeographicTrafficObservation,
  GeographicTrafficStation,
  OsmMatchabilityProbe,
  SourceAuditStatus,
} from "./contracts.js";
import { createBiarritzGeographicFrame } from "./geography.js";
import { createOsmMatchabilityProbe } from "./osm-matchability.js";
import type { OsmRoad } from "./osm-roads.js";
import {
  reconcileTrafficObservations,
  type ReconciledTrafficObservation,
} from "./reconciliation.js";
import { buildStationGroups, type StationGroup } from "./station-groups.js";
import { findStationContinuityCandidates } from "./station-continuity.js";

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

export interface AuditEvidenceDependencies {
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

export interface AuditEvidenceSnapshot {
  readonly config: AuditConfig;
  readonly frame: BiarritzGeographicFrame;
  readonly sources: readonly SourceAuditStatus[];
  readonly evidence: readonly GeographicEvidence[];
  readonly inScopeStations: readonly GeographicTrafficStation[];
  readonly stationGroups: readonly StationGroup[];
  readonly continuityCandidates: readonly ContinuityCandidate[];
  readonly reconciledObservations: readonly ReconciledTrafficObservation[];
  readonly osmMatchabilityProbe: OsmMatchabilityProbe | null;
  readonly issues: readonly AuditIssue[];
}

export interface AuditEvidenceCollector {
  collect(config: AuditConfig): Promise<AuditEvidenceSnapshot>;
}

export class TrafficAuditEvidenceCollector implements AuditEvidenceCollector {
  constructor(private readonly dependencies: AuditEvidenceDependencies) {}

  async collect(config: AuditConfig): Promise<AuditEvidenceSnapshot> {
    validateConfig(config);
    const boundary = await this.dependencies.loadBoundary(config);
    const frame = createBiarritzGeographicFrame(boundary);
    const loaded = await this.dependencies.loadSources(config, frame);
    const evidence = [...loaded.evidence].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const inScopeStations = evidence
      .filter(isStation)
      .filter((station) => station.geographicScope !== "outside");
    const observations = evidence.filter(isPointObservation);
    const continuityCandidates = findStationContinuityCandidates(inScopeStations);
    const stationGroups = buildStationGroups(
      inScopeStations,
      continuityCandidates,
    );
    const subjectByStationId = new Map<string, string>();
    for (const group of stationGroups) {
      for (const stationId of group.memberStationIds) {
        subjectByStationId.set(stationId, group.id);
      }
    }
    const reconciledObservations = reconcileTrafficObservations(
      observations.flatMap((observation) => {
        const stationId = observation.stationId;
        if (!stationId) return [];
        const subjectId = subjectByStationId.get(stationId);
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

    return {
      config: structuredClone(config),
      frame,
      sources: [...loaded.sources].sort((left, right) =>
        left.sourceId.localeCompare(right.sourceId),
      ),
      evidence,
      inScopeStations,
      stationGroups,
      continuityCandidates,
      reconciledObservations,
      osmMatchabilityProbe,
      issues: [...loaded.issues],
    };
  }
}

export function validateAuditConfig(config: AuditConfig): void {
  validateConfig(config);
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
