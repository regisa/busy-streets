import type {
  BiarritzGeographicFrame,
  AuditIssue,
  GeographicEvidence,
  GeographicScope,
  NormalizedEvidence,
  Phase1TrafficObservation,
  TrafficIssueReporter,
} from "./contracts.js";
import {
  classifyLineGeographicCoverage,
  classifyPointGeographicScope,
} from "./geography.js";

export async function* applyBiarritzGeographicFrame(
  evidence: AsyncIterable<NormalizedEvidence> | Iterable<NormalizedEvidence>,
  frame: BiarritzGeographicFrame,
  reportIssue?: TrafficIssueReporter,
): AsyncIterable<GeographicEvidence> {
  const stationScopes = new Map<string, GeographicScope>();
  const seenStationIds = new Set<string>();
  const pendingObservations = new Map<
    string,
    Phase1TrafficObservation[]
  >();

  for await (const item of evidence) {
    if ("kind" in item && item.kind === "station") {
      if (seenStationIds.has(item.id)) {
        failGeographicIssue(
          {
            code: "duplicate-station-id",
            severity: "error",
            sourceId: item.sourceId,
            sourceRecordId: item.sourceRecordId,
            message: `Station ${item.id} appears more than once in geographic evidence`,
          },
          reportIssue,
        );
      }
      const geographicScope = classifyPointGeographicScope(item.location, frame);
      seenStationIds.add(item.id);
      stationScopes.set(item.id, geographicScope);
      yield { ...item, geographicScope };

      for (const observation of pendingObservations.get(item.id) ?? []) {
        yield { ...observation, geographicScope };
      }
      pendingObservations.delete(item.id);
      continue;
    }

    if ("kind" in item && item.kind === "linear-traffic") {
      yield {
        ...item,
        geographicCoverage: classifyLineGeographicCoverage(item.geometry, frame),
      };
      continue;
    }

    const stationId = item.stationId;
    if (!stationId) {
      reportGeographicIssue(
        {
          code: "unscoped-traffic-observation",
          severity: "error",
          sourceId: item.sourceId,
          sourceRecordId: item.sourceRecordId,
          message: `Traffic observation ${item.id} cannot be classified without a station ID`,
        },
        reportIssue,
      );
      continue;
    }
    const geographicScope = stationScopes.get(stationId);
    if (geographicScope) {
      yield { ...item, geographicScope };
      continue;
    }

    const pending = pendingObservations.get(stationId) ?? [];
    pending.push(item);
    pendingObservations.set(stationId, pending);
  }

  for (const [stationId, observations] of pendingObservations) {
    for (const observation of observations) {
      reportGeographicIssue(
        {
          code: "unscoped-traffic-observation",
          severity: "error",
          sourceId: observation.sourceId,
          sourceRecordId: observation.sourceRecordId,
          message: `Traffic observation ${observation.id} references unavailable station ${stationId}`,
        },
        reportIssue,
      );
    }
  }
}

function reportGeographicIssue(
  issue: AuditIssue,
  reportIssue?: TrafficIssueReporter,
): void {
  if (reportIssue) {
    reportIssue(issue);
    return;
  }
  throw new GeographicEvidenceError(issue);
}

function failGeographicIssue(
  issue: AuditIssue,
  reportIssue?: TrafficIssueReporter,
): never {
  reportIssue?.(issue);
  throw new GeographicEvidenceError(issue);
}

export class GeographicEvidenceError extends Error {
  constructor(readonly issue: AuditIssue) {
    super(issue.message);
  }
}
