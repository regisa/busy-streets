import type { MultiPolygon } from "geojson";

import type {
  AuditIssue,
  AuditSummary,
  ContinuityCandidate,
  GeographicEvidence,
  OsmMatchabilityProbe,
  SourceAuditStatus,
} from "./contracts.js";
import type { ReconciledTrafficObservation } from "./reconciliation.js";

export interface BuildAuditSummaryInput {
  readonly asOf: string;
  readonly boundary: MultiPolygon;
  readonly sources: readonly SourceAuditStatus[];
  readonly evidence: readonly GeographicEvidence[];
  readonly reconciledObservations: readonly ReconciledTrafficObservation[];
  readonly continuityCandidates: readonly ContinuityCandidate[];
  readonly osmMatchabilityProbe: OsmMatchabilityProbe | null;
  readonly issues: readonly AuditIssue[];
  readonly recommendation: AuditSummary["recommendation"];
}

export function buildAuditSummary(input: BuildAuditSummaryInput): AuditSummary {
  assertUnique(
    input.sources,
    (source) => source.sourceId,
    "Audit source IDs must be unique",
  );
  assertUnique(
    input.evidence,
    (item) => item.id,
    "Geographic evidence IDs must be unique",
  );
  assertUnique(
    input.evidence.filter(
      (item) => !("kind" in item) || item.kind === "linear-traffic",
    ),
    (item) =>
      "kind" in item && item.kind === "linear-traffic"
        ? item.observation.id
        : item.id,
    "Traffic observation IDs must be unique",
  );
  assertUnique(
    input.reconciledObservations,
    (observation) => JSON.stringify([observation.subjectId, observation.year]),
    "Reconciled subject-year keys must be unique",
  );
  assertUnique(
    input.continuityCandidates,
    (candidate) =>
      JSON.stringify(
        [candidate.leftStationId, candidate.rightStationId].sort((left, right) =>
          left.localeCompare(right),
        ),
      ),
    "Continuity station pairs must be unique",
  );
  assertUnique(
    input.osmMatchabilityProbe?.results ?? [],
    (result) => result.stationId,
    "OSM matchability station IDs must be unique",
  );

  const qualityCounts = {
    measured: 0,
    modeled: 0,
    interpolated: 0,
    unknown: 0,
  };
  const years = new Set<number>();
  let stations = 0;
  let stationsInsideMunicipality = 0;
  let stationsBufferOnly = 0;
  let stationsOutside = 0;
  let observations = 0;
  let linearRecords = 0;
  let linearMunicipalityIntersections = 0;

  for (const item of input.evidence) {
    if ("kind" in item && item.kind === "station") {
      stations += 1;
      if (item.geographicScope === "inside-municipality") {
        stationsInsideMunicipality += 1;
      } else if (item.geographicScope === "buffer-only") {
        stationsBufferOnly += 1;
      } else {
        stationsOutside += 1;
      }
      continue;
    }
    if ("kind" in item && item.kind === "linear-traffic") {
      linearRecords += 1;
      observations += 1;
      years.add(item.observation.year);
      qualityCounts[item.observation.quality] += 1;
      if (item.geographicCoverage.municipalityIntersects) {
        linearMunicipalityIntersections += 1;
      }
      continue;
    }
    observations += 1;
    years.add(item.year);
    qualityCounts[item.quality] += 1;
  }

  const continuityCounts = countBy(
    input.continuityCandidates,
    (candidate) => candidate.classification,
  );
  const reconciliationCounts = countBy(
    input.reconciledObservations,
    (observation) => observation.resolution,
  );
  const osmCounts = countBy(
    input.osmMatchabilityProbe?.results ?? [],
    (result) => result.classification,
  );

  return {
    schemaVersion: 1,
    asOf: input.asOf,
    city: {
      name: "Biarritz",
      inseeCode: "64122",
      boundary: structuredClone(input.boundary),
      bufferKilometers: 2,
    },
    sources: [...input.sources].sort((left, right) =>
      left.sourceId.localeCompare(right.sourceId),
    ),
    years: [...years].sort((left, right) => left - right),
    counts: {
      continuityProbable: continuityCounts.get("probable") ?? 0,
      continuityReview: continuityCounts.get("review") ?? 0,
      continuitySeparate: continuityCounts.get("separate") ?? 0,
      linearMunicipalityIntersections,
      linearRecords,
      observations,
      osmAmbiguous: osmCounts.get("ambiguous") ?? 0,
      osmPlausible: osmCounts.get("plausible") ?? 0,
      osmUnmatched: osmCounts.get("unmatched") ?? 0,
      reconciliationCanonical: reconciliationCounts.get("canonical") ?? 0,
      reconciliationUnresolvedConflicts:
        reconciliationCounts.get("unresolved-conflict") ?? 0,
      stations,
      stationsBufferOnly,
      stationsInsideMunicipality,
      stationsOutside,
    },
    qualityCounts,
    issues: [...input.issues].sort(compareIssues),
    recommendation: input.recommendation,
  };
}

export function serializeAuditSummary(summary: AuditSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

function countBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const valueKey = key(value);
    counts.set(valueKey, (counts.get(valueKey) ?? 0) + 1);
  }
  return counts;
}

function compareIssues(left: AuditIssue, right: AuditIssue): number {
  return (
    left.code.localeCompare(right.code) ||
    (left.sourceId ?? "").localeCompare(right.sourceId ?? "") ||
    (left.sourceRecordId ?? "").localeCompare(right.sourceRecordId ?? "") ||
    left.severity.localeCompare(right.severity) ||
    left.message.localeCompare(right.message)
  );
}

function assertUnique<T>(
  values: readonly T[],
  identity: (value: T) => string,
  message: string,
): void {
  const identities = new Set<string>();
  for (const value of values) {
    const id = identity(value);
    if (identities.has(id)) throw new Error(message);
    identities.add(id);
  }
}
