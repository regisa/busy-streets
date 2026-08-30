import { readFile } from "node:fs/promises";

import type {
  Feature,
  LineString,
  MultiLineString,
  Point,
} from "geojson";

import type {
  AuditIssue,
  SourceArtifact,
  SourceRecord,
  TrafficIssueReporter,
} from "./contracts.js";

export interface GeoJsonSourceRecordInput {
  readonly artifact: SourceArtifact;
  readonly localPath: string;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function featureCollection(value: unknown): readonly unknown[] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    value.type !== "FeatureCollection" ||
    !("features" in value) ||
    !Array.isArray(value.features)
  ) {
    throw new Error("GeoJSON source artifact must contain a FeatureCollection");
  }
  return value.features;
}

function sourceFeature(value: unknown): Feature {
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    value.type !== "Feature"
  ) {
    throw new Error('GeoJSON feature entries must have type "Feature"');
  }
  return value as Feature;
}

function sourceGeometry(
  feature: Feature,
): Point | LineString | MultiLineString {
  const geometry = feature.geometry;
  if (
    !geometry ||
    (geometry.type !== "Point" &&
      geometry.type !== "LineString" &&
      geometry.type !== "MultiLineString")
  ) {
    throw new Error(
      `Unsupported source geometry: ${geometry?.type ?? "null"}`,
    );
  }
  const validPosition = (value: unknown): boolean =>
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every(
      (ordinate) => typeof ordinate === "number" && Number.isFinite(ordinate),
    );
  const coordinatesAreValid =
    geometry.type === "Point"
      ? validPosition(geometry.coordinates)
      : geometry.type === "LineString"
        ? geometry.coordinates.length >= 2 &&
          geometry.coordinates.every(validPosition)
        : geometry.coordinates.length > 0 &&
          geometry.coordinates.every(
            (line) => line.length >= 2 && line.every(validPosition),
          );
  if (!coordinatesAreValid) {
    throw new Error(`Invalid ${geometry.type} coordinates`);
  }
  return structuredClone(geometry) as Point | LineString | MultiLineString;
}

function sourceProperties(
  properties: unknown,
): Readonly<Record<string, unknown>> {
  if (properties === null || properties === undefined) return {};
  if (typeof properties !== "object" || Array.isArray(properties)) {
    throw new Error("GeoJSON feature properties must be an object or null");
  }
  return structuredClone(properties) as Record<string, unknown>;
}

export async function* readGeoJsonSourceRecords(
  input: GeoJsonSourceRecordInput,
  reportIssue?: TrafficIssueReporter,
): AsyncIterable<SourceRecord> {
  const parsed: unknown = JSON.parse(await readFile(input.localPath, "utf8"));
  const features = featureCollection(parsed);

  for (const [index, candidate] of features.entries()) {
    const recordId = `${input.artifact.id}:record:${index}`;
    try {
      const feature = sourceFeature(candidate);
      const externalId =
        typeof feature.id === "string" || typeof feature.id === "number"
          ? String(feature.id)
          : undefined;
      const record = {
        id: recordId,
        sourceId: input.artifact.sourceId,
        artifactId: input.artifact.id,
        ...(externalId ? { externalId } : {}),
        geometry: sourceGeometry(feature),
        properties: sourceProperties(feature.properties),
      } satisfies SourceRecord;
      yield deepFreeze(record);
    } catch (error) {
      const issue: AuditIssue = {
        code: "invalid-source-record",
        severity: "error",
        sourceId: input.artifact.sourceId,
        sourceRecordId: recordId,
        message: error instanceof Error ? error.message : String(error),
      };
      if (!reportIssue) throw new SourceRecordReadError(issue);
      reportIssue(issue);
    }
  }
}

export class SourceRecordReadError extends Error {
  constructor(readonly issue: AuditIssue) {
    super(issue.message);
  }
}
