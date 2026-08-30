import type {
  ArtifactPathResolver,
  NormalizedEvidence,
  SourceArtifact,
  SourceInspection,
  SourceRecord,
  TrafficIssueReporter,
  TrafficSourceAdapter,
} from "../contracts.js";
import { inspectArtifact } from "../inspection.js";
import { readGeoJsonSourceRecords } from "../source-records.js";
import {
  normalizeRoadIdentity,
  optionalTrafficNumber,
  requireWgs84Point,
  TrafficNormalizationError,
} from "./shared.js";

export { TrafficNormalizationError } from "./shared.js";

const SOURCE_ID = "cd64-latest-road-counts-point";

function assertCompatibleArtifact(artifact: SourceArtifact): void {
  if (artifact.sourceId !== SOURCE_ID) {
    throw new Error(
      `CD64 latest-count adapter cannot normalize ${artifact.sourceId}`,
    );
  }
  if (artifact.crs !== "EPSG:4326") {
    throw new Error("CD64 latest-count adapter requires EPSG:4326");
  }
  if (artifact.adapterVersion !== "1") {
    throw new Error("CD64 latest-count adapter requires adapter version 1");
  }
}

function sourceStationId(record: SourceRecord): string {
  const value = record.properties.id;
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    String(value).trim().length === 0
  ) {
    throw new TrafficNormalizationError({
      code: "missing-station-id",
      severity: "error",
      sourceId: SOURCE_ID,
      sourceRecordId: record.id,
      message: "id must be a non-empty string or number",
    });
  }
  return String(value).trim();
}

function observationYear(record: SourceRecord): number {
  const value = record.properties.annee;
  const year =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{4}$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(year) || year < 2012 || year > 2022) {
    throw new TrafficNormalizationError({
      code: "invalid-observation-year",
      severity: "error",
      sourceId: SOURCE_ID,
      sourceRecordId: record.id,
      message: "annee must be an integer from 2012 through 2022",
    });
  }
  return year;
}

function continuityStationId(
  record: SourceRecord,
  roadRef: string | undefined,
): string | undefined {
  const position = record.properties.pr;
  if (roadRef === undefined || typeof position !== "string") return undefined;
  const match = position.match(/^\s*(\d+)\s*\+\s*(\d+)\s*$/);
  if (!match?.[1] || !match[2]) return undefined;
  return `64-${roadRef}-${Number(match[1])}+${Number(match[2])}`;
}

export function normalizeCd64LatestRoadCountRecord(
  record: SourceRecord,
): readonly NormalizedEvidence[] {
  requireWgs84Point(record, SOURCE_ID, "CD64 latest road count");
  if (record.geometry.type !== "Point") throw new Error("unreachable");
  const sourceId = sourceStationId(record);
  const year = observationYear(record);
  const stationId = `${SOURCE_ID}:station:${sourceId}`;
  const roadIdentity = normalizeRoadIdentity(record.properties.voie);
  const roadRef = "roadRef" in roadIdentity ? roadIdentity.roadRef : undefined;
  const continuityId = continuityStationId(record, roadRef);
  const station = {
    kind: "station" as const,
    id: stationId,
    sourceId: SOURCE_ID,
    sourceRecordId: record.id,
    ...(continuityId ? { sourceStationId: continuityId } : {}),
    counterType: "unknown" as const,
    location: record.geometry,
    ...roadIdentity,
  };
  const vehiclesPerDay = optionalTrafficNumber(record, SOURCE_ID, "mja");
  const heavyVehiclePercent = optionalTrafficNumber(
    record,
    SOURCE_ID,
    "mjappl",
    100,
  );
  if (vehiclesPerDay === null && heavyVehiclePercent === null) return [station];
  return [
    station,
    {
      id: `${record.id}:observation:${year}`,
      sourceRecordId: record.id,
      stationId,
      year,
      periodType: "annual",
      vehiclesPerDay,
      heavyVehiclePercent,
      quality: "measured",
      sourceId: SOURCE_ID,
    },
  ];
}

export class Cd64LatestRoadCountsAdapter implements TrafficSourceAdapter {
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

  async *normalize(artifact: SourceArtifact): AsyncIterable<NormalizedEvidence> {
    assertCompatibleArtifact(artifact);
    for await (const record of readGeoJsonSourceRecords(
      { artifact, localPath: await this.resolvePath(artifact) },
      this.reportIssue,
    )) {
      try {
        for (const evidence of normalizeCd64LatestRoadCountRecord(record)) {
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
