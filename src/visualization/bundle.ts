import type { AuditEvidenceSnapshot } from "../traffic/audit-evidence.js";
import type {
  AuditIssue,
  GeographicTrafficStation,
} from "../traffic/contracts.js";
import type { IgnRoadArtifact } from "../traffic/ign-roads.js";
import type { ReconciledTrafficObservation } from "../traffic/reconciliation.js";
import { findTrafficSource } from "../traffic/source-catalog.js";
import {
  visualizationBundleSchema,
  type StreetTrafficAssignment,
  type VisualizationBundle,
} from "./contracts.js";
import type { StreetSubject, TargetCorridor } from "./street-network.js";

export interface BuildVisualizationBundleInput {
  readonly audit: AuditEvidenceSnapshot;
  readonly ignArtifact: IgnRoadArtifact;
  readonly streets: readonly StreetSubject[];
  readonly targets: readonly TargetCorridor[];
  readonly assignments: readonly StreetTrafficAssignment[];
}

export function buildVisualizationBundle(
  input: BuildVisualizationBundleInput,
): VisualizationBundle {
  const sources = [
    ...input.audit.sources.map((source) => ({
      sourceId: source.sourceId,
      status: source.status,
      ...(source.artifactId ? { artifactId: source.artifactId } : {}),
      ...(source.blockedReason ? { blockedReason: source.blockedReason } : {}),
    })),
    {
      sourceId: "ign-bdtopo-roads",
      status: "audited" as const,
      artifactId: input.ignArtifact.id,
      sha256: input.ignArtifact.sha256,
      sourceUrl: input.ignArtifact.sourceUrl,
      licenseUrl: input.ignArtifact.license.url,
    },
  ].sort((left, right) => left.sourceId.localeCompare(right.sourceId));

  const stationsById = new Map(
    input.audit.inScopeStations.map((station) => [station.id, station]),
  );
  const observationsByGroup = new Map<string, ReconciledTrafficObservation[]>();
  for (const observation of input.audit.reconciledObservations) {
    const observations = observationsByGroup.get(observation.subjectId) ?? [];
    observations.push(observation);
    observationsByGroup.set(observation.subjectId, observations);
  }

  const stationGroups = [...input.audit.stationGroups]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((group) => {
      const members = group.memberStationIds
        .map((id) => {
          const station = stationsById.get(id);
          if (!station) throw new Error(`Missing station group member: ${id}`);
          return station;
        })
        .sort((left, right) => left.id.localeCompare(right.id));
      const displayStation = chooseDisplayStation(members);
      const reconciled = [...(observationsByGroup.get(group.id) ?? [])].sort(
        (left, right) => left.year - right.year,
      );
      return {
        id: group.id,
        location: structuredClone(displayStation.location),
        memberStationIds: members.map(({ id }) => id),
        members: members.map(toVisualizationStation),
        observations: reconciled.flatMap((observation) => {
          const canonical = observation.canonical;
          if (!canonical) return [];
          return [
            {
              year: observation.year,
              vehiclesPerDay: canonical.vehiclesPerDay,
              heavyVehiclePercent: canonical.heavyVehiclePercent,
              quality: canonical.quality,
              sourceLinks: [...canonical.sourceLinks],
            },
          ];
        }),
        issues: groupIssues(group.memberStationIds, reconciled, input.audit),
      };
    });

  return visualizationBundleSchema.parse({
    schemaVersion: 1,
    asOf: input.audit.config.asOf,
    municipalityInseeCode: input.audit.frame.inseeCode,
    bufferKilometers: input.audit.frame.bufferKilometers,
    boundary: structuredClone(input.audit.frame.boundary),
    buffer: structuredClone(input.audit.frame.buffer),
    sources,
    stationGroups,
    streetSubjects: [...input.streets]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((street) => ({ ...structuredClone(street), evidenceState: "no-data" })),
    targetCorridors: [...input.targets]
      .sort((left, right) => left.targetId.localeCompare(right.targetId))
      .map((target) => ({ ...structuredClone(target), reviewStatus: "pending" })),
    streetAssignments: [...input.assignments].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    issues: [...input.audit.issues].sort(compareIssues),
  });
}

export function serializeVisualizationBundle(bundle: VisualizationBundle): string {
  return `${JSON.stringify(visualizationBundleSchema.parse(bundle), null, 2)}\n`;
}

function chooseDisplayStation(
  stations: readonly GeographicTrafficStation[],
): GeographicTrafficStation {
  const ordered = [...stations].sort((left, right) => {
    const leftPublished = findTrafficSource(left.sourceId)?.publicationDate ?? "";
    const rightPublished = findTrafficSource(right.sourceId)?.publicationDate ?? "";
    return (
      rightPublished.localeCompare(leftPublished) || left.id.localeCompare(right.id)
    );
  });
  const station = ordered[0];
  if (!station) throw new Error("Station group must contain a member");
  return station;
}

function toVisualizationStation(station: GeographicTrafficStation) {
  return {
    id: station.id,
    sourceId: station.sourceId,
    sourceRecordId: station.sourceRecordId,
    ...(station.sourceStationId ? { sourceStationId: station.sourceStationId } : {}),
    counterType: station.counterType,
    location: structuredClone(station.location),
    ...(station.roadRef ? { roadRef: station.roadRef } : {}),
    ...(station.roadName ? { roadName: station.roadName } : {}),
    ...(station.bearing !== undefined ? { bearing: station.bearing } : {}),
    geographicScope: station.geographicScope,
  };
}

function groupIssues(
  memberIds: readonly string[],
  observations: readonly ReconciledTrafficObservation[],
  audit: AuditEvidenceSnapshot,
): readonly AuditIssue[] {
  const memberSet = new Set(memberIds);
  const issues: AuditIssue[] = observations.flatMap((observation) =>
    observation.resolution === "unresolved-conflict"
      ? [
          {
            code: "unresolved-observation-conflict",
            severity: "warning" as const,
            message: `No canonical traffic value for ${observation.year}`,
          },
        ]
      : [],
  );
  for (const result of audit.osmMatchabilityProbe?.results ?? []) {
    if (memberSet.has(result.stationId) && result.classification !== "plausible") {
      issues.push({
        code: `osm-match-${result.classification}`,
        severity: "warning",
        message: `OSM road match is ${result.classification} for ${result.stationId}`,
      });
    }
  }
  for (const candidate of audit.continuityCandidates) {
    if (
      candidate.classification === "review" &&
      (memberSet.has(candidate.leftStationId) || memberSet.has(candidate.rightStationId))
    ) {
      issues.push({
        code: "station-continuity-review",
        severity: "warning",
        message: `Station continuity requires review: ${candidate.leftStationId} / ${candidate.rightStationId}`,
      });
    }
  }
  return issues.sort(compareIssues);
}

function compareIssues(left: AuditIssue, right: AuditIssue): number {
  return (
    left.code.localeCompare(right.code) ||
    (left.sourceId ?? "").localeCompare(right.sourceId ?? "") ||
    (left.sourceRecordId ?? "").localeCompare(right.sourceRecordId ?? "") ||
    left.message.localeCompare(right.message)
  );
}
