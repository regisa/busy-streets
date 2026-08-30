import { z } from "zod";

import type {
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";

export const trafficQualitySchema = z.enum([
  "measured",
  "modeled",
  "interpolated",
  "unknown",
]);

export type TrafficQuality = z.infer<typeof trafficQualitySchema>;

export const counterTypeSchema = z.enum([
  "permanent",
  "rotating",
  "occasional",
  "unknown",
]);

export type CounterType = z.infer<typeof counterTypeSchema>;

export const geographicScopeSchema = z.enum([
  "inside-municipality",
  "buffer-only",
  "outside",
]);

export type GeographicScope = z.infer<typeof geographicScopeSchema>;

export interface BiarritzGeographicFrame {
  readonly inseeCode: "64122";
  readonly boundary: MultiPolygon;
  readonly buffer: Polygon | MultiPolygon;
  readonly bufferKilometers: 2;
}

export interface LinearGeographicCoverage {
  readonly municipalityIntersects: boolean;
  readonly bufferIntersects: boolean;
  readonly lengthInsideMunicipalityKilometers: number;
}

export interface Wgs84BoundingBox {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

const nullableNonNegativeNumberSchema = z.number().finite().nonnegative().nullable();

export const trafficObservationSchema = z.object({
  id: z.string().min(1),
  sourceRecordId: z.string().min(1),
  stationId: z.string().min(1).optional(),
  sourceGeometryId: z.string().min(1).optional(),
  year: z.number().int().min(1900).max(2100),
  periodType: z.literal("annual"),
  vehiclesPerDay: nullableNonNegativeNumberSchema,
  heavyVehiclePercent: z.number().finite().min(0).max(100).nullable(),
  quality: trafficQualitySchema,
  sourceId: z.string().min(1),
});

export const phase1TrafficObservationSchema = trafficObservationSchema.refine(
  (observation) => observation.quality !== "interpolated",
  {
    message: "Phase 1 must not emit interpolated traffic observations",
    path: ["quality"],
  },
);

export type TrafficObservation = z.infer<typeof trafficObservationSchema>;
export type Phase1TrafficObservation = z.infer<
  typeof phase1TrafficObservationSchema
>;

export interface SourceLicense {
  readonly code: "lov2" | "not-specified";
  readonly label: string;
  readonly url: string | null;
  readonly redistributionAllowed: boolean;
  readonly verifiedAt: string;
}

export interface SourceArtifact {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceUrl: string;
  readonly originalFilename: string;
  readonly acquiredAt: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly crs: string | null;
  readonly adapterVersion: string;
  readonly license: SourceLicense;
}

export type ArtifactPathResolver = (
  artifact: SourceArtifact,
) => Promise<string>;

export type TrafficIssueReporter = (issue: AuditIssue) => void;

export interface SourceDefinition {
  readonly id: string;
  readonly title: string;
  readonly datasetUrl: string;
  readonly resourceUrl: string;
  readonly coverageYears: readonly [number, number];
  readonly geometryKind: "point" | "line";
  readonly publicationDate: string;
  readonly adapterVersion: string;
  readonly expectedFormats: readonly ("zip" | "shp" | "geojson")[];
  readonly resourceCrs?: "EPSG:4326";
  readonly wfs?: {
    readonly endpoint: string;
    readonly typeName: string;
    readonly version: "2.0.0";
    readonly outputFormat: "application/json; subtype=geojson";
    readonly outputCrs: "EPSG:4326";
  };
  readonly license: SourceLicense;
}

export interface SourceFieldInspection {
  readonly name: string;
  readonly inferredTypes: readonly string[];
  readonly nullCount: number;
  readonly sampleValues: readonly unknown[];
}

export interface SourceInspection {
  readonly sourceId: string;
  readonly artifactId: string;
  readonly schemaArtifactId?: string;
  readonly geometryTypes: readonly string[];
  readonly crs: string | null;
  readonly encoding: string | null;
  readonly recordCount: number;
  readonly fields: readonly SourceFieldInspection[];
  readonly issues: readonly AuditIssue[];
}

export interface SourceRecord {
  readonly id: string;
  readonly sourceId: string;
  readonly artifactId: string;
  readonly externalId?: string;
  readonly geometry: Point | LineString | MultiLineString;
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface TrafficStation {
  readonly kind: "station";
  readonly id: string;
  readonly sourceId: string;
  readonly sourceRecordId: string;
  readonly sourceStationId?: string;
  readonly counterType: CounterType;
  readonly location: Point;
  readonly roadRef?: string;
  readonly roadName?: string;
  readonly bearing?: number;
}

export interface LinearTrafficRecord {
  readonly kind: "linear-traffic";
  readonly id: string;
  readonly sourceId: string;
  readonly sourceRecordId: string;
  readonly geometry: LineString | MultiLineString;
  readonly roadRef?: string;
  readonly roadName?: string;
  readonly observation: Phase1TrafficObservation;
}

export type NormalizedEvidence =
  | TrafficStation
  | Phase1TrafficObservation
  | LinearTrafficRecord;

export type GeographicTrafficStation = TrafficStation & {
  readonly geographicScope: GeographicScope;
};

export type GeographicTrafficObservation = Phase1TrafficObservation & {
  readonly geographicScope: GeographicScope;
};

export type GeographicLinearTrafficRecord = LinearTrafficRecord & {
  readonly geographicCoverage: LinearGeographicCoverage;
};

export type GeographicEvidence =
  | GeographicTrafficStation
  | GeographicTrafficObservation
  | GeographicLinearTrafficRecord;

export interface TrafficSourceAdapter {
  inspect(artifact: SourceArtifact): Promise<SourceInspection>;
  normalize(artifact: SourceArtifact): AsyncIterable<NormalizedEvidence>;
}

export interface ContinuityCandidate {
  readonly leftStationId: string;
  readonly rightStationId: string;
  readonly score: number;
  readonly classification: "probable" | "review" | "separate";
  readonly distanceMeters: number;
  readonly rejectedReason?: string;
  readonly evidence: Readonly<Record<string, number | string | boolean>>;
}

export interface RoadMatchCandidate {
  readonly stationId: string;
  readonly osmWayId: string;
  readonly score: number;
  readonly distanceMeters: number;
  readonly rejectedReason?: string;
  readonly evidence: Readonly<Record<string, number | string | boolean>>;
}

export interface StationRoadMatchResult {
  readonly stationId: string;
  readonly classification: "plausible" | "ambiguous" | "unmatched";
  readonly searchRadiusMeters: 75 | 200;
  readonly selected: RoadMatchCandidate | null;
  readonly runnerUpGap: number | null;
  readonly candidates: readonly RoadMatchCandidate[];
  readonly rejectedCandidates: readonly RoadMatchCandidate[];
}

export interface OsmMatchabilityProbe {
  readonly schemaVersion: 1;
  readonly osmExtract: {
    readonly artifactId: string;
    readonly sha256: string;
    readonly osmBaseTimestamp: string;
  };
  readonly results: readonly StationRoadMatchResult[];
}

export interface AuditIssue {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly sourceId?: string;
  readonly sourceRecordId?: string;
  readonly message: string;
}

export interface SourceAuditStatus {
  readonly sourceId: string;
  readonly status: "audited" | "blocked";
  readonly artifactId?: string;
  readonly blockedReason?: string;
  readonly inspection?: SourceInspection;
}

export interface AuditSummary {
  readonly schemaVersion: 1;
  readonly asOf: string;
  readonly city: {
    readonly name: "Biarritz";
    readonly inseeCode: "64122";
    readonly boundary: MultiPolygon;
    readonly bufferKilometers: 2;
  };
  readonly sources: readonly SourceAuditStatus[];
  readonly years: readonly number[];
  readonly counts: Readonly<Record<string, number>>;
  readonly qualityCounts: Readonly<Record<TrafficQuality, number>>;
  readonly issues: readonly AuditIssue[];
  readonly recommendation:
    | "road-level-measured-mvp"
    | "limited-corridor-or-station-explorer"
    | "insufficient-open-data";
}

export interface AuditConfig {
  readonly asOf: string;
  readonly cacheDirectory: string;
  readonly outputDirectory: string;
  readonly boundaryInseeCode: "64122";
  readonly bufferKilometers: 2;
}

export interface AuditRunner {
  run(config: AuditConfig): Promise<AuditSummary>;
}
