import type {
  ArtifactPathResolver,
  NormalizedEvidence,
  SourceArtifact,
  SourceInspection,
  SourceRecord,
  TrafficSourceAdapter,
  TrafficIssueReporter,
} from "../contracts.js";
import { inspectArtifact } from "../inspection.js";
import { readGeoJsonSourceRecords } from "../source-records.js";
import {
  normalizeCounterType,
  normalizeRoadIdentity,
  optionalTrafficNumber,
  requireStationId,
  requireWgs84Point,
  TrafficNormalizationError,
} from "./shared.js";

export { TrafficNormalizationError } from "./shared.js";

const SOURCE_ID = "dreal-2024-point";

function assertCompatibleArtifact(artifact: SourceArtifact): void {
  if (artifact.sourceId !== SOURCE_ID) {
    throw new Error(
      `DREAL 2024 point adapter cannot normalize ${artifact.sourceId}`,
    );
  }
  if (artifact.crs !== "EPSG:4326") {
    throw new Error("DREAL 2024 point adapter requires EPSG:4326");
  }
  if (artifact.adapterVersion !== "1") {
    throw new Error("DREAL 2024 point adapter requires adapter version 1");
  }
}

export function normalizeDreal2024PointRecord(
  record: SourceRecord,
): readonly NormalizedEvidence[] {
  requireWgs84Point(record, SOURCE_ID, "DREAL 2024 point");
  if (record.geometry.type !== "Point") throw new Error("unreachable");
  const sourceStationId = requireStationId(record, SOURCE_ID);
  const stationId = `${SOURCE_ID}:station:${sourceStationId}`;
  const station = {
    kind: "station" as const,
    id: stationId,
    sourceId: SOURCE_ID,
    sourceRecordId: record.id,
    sourceStationId,
    counterType: normalizeCounterType(record.properties.type_poste),
    location: record.geometry,
    ...normalizeRoadIdentity(record.properties.route),
  };
  const vehiclesPerDay = optionalTrafficNumber(
    record,
    SOURCE_ID,
    "tmja_2024",
  );
  const heavyVehiclePercent = optionalTrafficNumber(
    record,
    SOURCE_ID,
    "pc_pl_2024",
    100,
  );
  if (vehiclesPerDay === null && heavyVehiclePercent === null) return [station];
  const observation = {
    id: `${record.id}:observation:2024`,
    sourceRecordId: record.id,
    stationId,
    year: 2024,
    periodType: "annual" as const,
    vehiclesPerDay,
    heavyVehiclePercent,
    quality: "measured" as const,
    sourceId: SOURCE_ID,
  };
  return [station, observation];
}

export class Dreal2024PointAdapter implements TrafficSourceAdapter {
  constructor(
    private readonly resolvePath: ArtifactPathResolver,
    private readonly reportIssue?: TrafficIssueReporter,
  ) {}

  async inspect(artifact: SourceArtifact): Promise<SourceInspection> {
    assertCompatibleArtifact(artifact);
    return inspectArtifact({
      artifact,
      localPath: await this.resolvePath(artifact),
    });
  }

  async *normalize(
    artifact: SourceArtifact,
  ): AsyncIterable<NormalizedEvidence> {
    assertCompatibleArtifact(artifact);
    const localPath = await this.resolvePath(artifact);
    for await (const record of readGeoJsonSourceRecords(
      { artifact, localPath },
      this.reportIssue,
    )) {
      try {
        for (const evidence of normalizeDreal2024PointRecord(record)) {
          yield evidence;
        }
      } catch (error) {
        if (!(error instanceof TrafficNormalizationError) || !this.reportIssue) {
          throw error;
        }
        this.reportIssue(error.issue);
      }
    }
  }
}
