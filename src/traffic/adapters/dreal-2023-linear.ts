import type {
  ArtifactPathResolver,
  LinearTrafficRecord,
  SourceArtifact,
  SourceInspection,
  SourceRecord,
  TrafficIssueReporter,
  TrafficSourceAdapter,
} from "../contracts.js";
import { inspectArtifact } from "../inspection.js";
import { readGeoJsonSourceRecords } from "../source-records.js";
import {
  requireWgs84Line,
  TrafficNormalizationError,
} from "./shared.js";

export { TrafficNormalizationError } from "./shared.js";

const SOURCE_ID = "dreal-2023-linear";

function normalizationError(
  record: SourceRecord,
  code: string,
  message: string,
): TrafficNormalizationError {
  return new TrafficNormalizationError({
    code,
    severity: "error",
    sourceId: SOURCE_ID,
    sourceRecordId: record.id,
    message,
  });
}

function assertCompatibleArtifact(artifact: SourceArtifact): void {
  if (artifact.sourceId !== SOURCE_ID) {
    throw new Error(
      `DREAL 2023 linear adapter cannot normalize ${artifact.sourceId}`,
    );
  }
  if (artifact.crs !== "EPSG:4326") {
    throw new Error("DREAL 2023 linear adapter requires EPSG:4326");
  }
  if (artifact.adapterVersion !== "1") {
    throw new Error("DREAL 2023 linear adapter requires adapter version 1");
  }
}

export function normalizeDreal2023LinearRecord(
  record: SourceRecord,
): LinearTrafficRecord {
  requireWgs84Line(record, SOURCE_ID, "DREAL 2023 linear");
  if (
    record.geometry.type !== "LineString" &&
    record.geometry.type !== "MultiLineString"
  ) {
    throw new Error("unreachable");
  }
  const rawSourceGeometryId = record.properties.id_ign;
  if (
    typeof rawSourceGeometryId !== "string" ||
    rawSourceGeometryId.trim().length === 0
  ) {
    throw normalizationError(
      record,
      "missing-geometry-id",
      "id_ign must be a non-empty string",
    );
  }
  const sourceGeometryId = rawSourceGeometryId.trim();
  if (record.properties.millesime !== "2023") {
    throw normalizationError(
      record,
      "invalid-observation-year",
      'millesime must equal "2023"',
    );
  }
  const lengthKilometers = record.properties.long_km;
  if (
    typeof lengthKilometers !== "number" ||
    !Number.isFinite(lengthKilometers) ||
    lengthKilometers <= 0
  ) {
    throw normalizationError(
      record,
      "invalid-segment-length",
      "long_km must be a finite positive number",
    );
  }
  const vehicleKilometers = record.properties.veh_km;
  if (
    typeof vehicleKilometers !== "number" ||
    !Number.isFinite(vehicleKilometers) ||
    vehicleKilometers < 0
  ) {
    throw normalizationError(
      record,
      "invalid-traffic-value",
      "veh_km must be a finite non-negative number",
    );
  }
  const vehiclesPerDay = vehicleKilometers / lengthKilometers;
  if (!Number.isFinite(vehiclesPerDay)) {
    throw normalizationError(
      record,
      "invalid-traffic-value",
      "veh_km divided by long_km must produce a finite daily flow",
    );
  }
  const rawHeavyVehiclePercent = record.properties.pc_pl;
  const heavyVehiclePercent =
    rawHeavyVehiclePercent === null || rawHeavyVehiclePercent === undefined
      ? null
      : rawHeavyVehiclePercent;
  if (
    heavyVehiclePercent !== null &&
    (typeof heavyVehiclePercent !== "number" ||
      !Number.isFinite(heavyVehiclePercent) ||
      heavyVehiclePercent < 0 ||
      heavyVehiclePercent > 100)
  ) {
    throw normalizationError(
      record,
      "invalid-traffic-value",
      "pc_pl must be a finite number between 0 and 100 or null",
    );
  }
  const rawRoadRef = record.properties.numero;
  const roadRef =
    typeof rawRoadRef === "string" && rawRoadRef.trim().length > 0
      ? rawRoadRef.trim()
      : undefined;

  return {
    kind: "linear-traffic",
    id: `${SOURCE_ID}:line:${sourceGeometryId}`,
    sourceId: SOURCE_ID,
    sourceRecordId: record.id,
    geometry: record.geometry,
    ...(roadRef ? { roadRef } : {}),
    observation: {
      id: `${record.id}:observation:2023`,
      sourceRecordId: record.id,
      sourceGeometryId,
      year: 2023,
      periodType: "annual",
      vehiclesPerDay,
      heavyVehiclePercent,
      quality: "unknown",
      sourceId: SOURCE_ID,
    },
  };
}

export class Dreal2023LinearAdapter implements TrafficSourceAdapter {
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
  ): AsyncIterable<LinearTrafficRecord> {
    assertCompatibleArtifact(artifact);
    const localPath = await this.resolvePath(artifact);
    for await (const record of readGeoJsonSourceRecords(
      { artifact, localPath },
      this.reportIssue,
    )) {
      try {
        yield normalizeDreal2023LinearRecord(record);
      } catch (error) {
        if (!(error instanceof TrafficNormalizationError) || !this.reportIssue) {
          throw error;
        }
        this.reportIssue(error.issue);
      }
    }
  }
}
