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
  normalizeCounterType,
  normalizeRoadIdentity,
  optionalTrafficNumber,
  requireStationId,
  requireWgs84Point,
  TrafficNormalizationError,
} from "./shared.js";

export { TrafficNormalizationError } from "./shared.js";

const SOURCE_ID = "dreal-2019-2023-point";
const YEARS = [2019, 2020, 2021, 2022, 2023] as const;

function assertCompatibleArtifact(artifact: SourceArtifact): void {
  if (artifact.sourceId !== SOURCE_ID) {
    throw new Error(
      `DREAL 2019-2023 point adapter cannot normalize ${artifact.sourceId}`,
    );
  }
  if (artifact.crs !== "EPSG:4326") {
    throw new Error("DREAL 2019-2023 point adapter requires EPSG:4326");
  }
  if (artifact.adapterVersion !== "1") {
    throw new Error(
      "DREAL 2019-2023 point adapter requires adapter version 1",
    );
  }
}

export function normalizeDreal2019To2023PointRecord(
  record: SourceRecord,
  reportIssue?: TrafficIssueReporter,
): readonly NormalizedEvidence[] {
  requireWgs84Point(record, SOURCE_ID, "DREAL 2019-2023 point");
  if (record.geometry.type !== "Point") throw new Error("unreachable");
  const sourceStationId = requireStationId(record, SOURCE_ID);
  const stationId = `${SOURCE_ID}:station:${sourceStationId}`;

  const evidence: NormalizedEvidence[] = [
    {
      kind: "station",
      id: stationId,
      sourceId: SOURCE_ID,
      sourceRecordId: record.id,
      sourceStationId,
      counterType: normalizeCounterType(record.properties.type_poste),
      location: record.geometry,
      ...normalizeRoadIdentity(record.properties.route),
    },
  ];

  for (const year of YEARS) {
    try {
      const vehiclesPerDay = optionalTrafficNumber(
        record,
        SOURCE_ID,
        `tmja_${year}`,
      );
      const heavyVehiclePercent = optionalTrafficNumber(
        record,
        SOURCE_ID,
        `pc_pl_${year}`,
        100,
      );
      if (vehiclesPerDay === null && heavyVehiclePercent === null) continue;
      evidence.push({
        id: `${record.id}:observation:${year}`,
        sourceRecordId: record.id,
        stationId,
        year,
        periodType: "annual",
        vehiclesPerDay,
        heavyVehiclePercent,
        quality: "measured",
        sourceId: SOURCE_ID,
      });
    } catch (error) {
      if (!(error instanceof TrafficNormalizationError) || !reportIssue) {
        throw error;
      }
      reportIssue(error.issue);
    }
  }

  return evidence;
}

export class Dreal2019To2023PointAdapter implements TrafficSourceAdapter {
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
        for (const evidence of normalizeDreal2019To2023PointRecord(
          record,
          this.reportIssue,
        )) {
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
