import type {
  AuditIssue,
  CounterType,
  SourceRecord,
} from "../contracts.js";

export class TrafficNormalizationError extends Error {
  constructor(readonly issue: AuditIssue) {
    super(issue.message);
  }
}

export function requireWgs84Point(
  record: SourceRecord,
  sourceId: string,
  sourceLabel: string,
): void {
  if (record.geometry.type !== "Point") {
    throw new TrafficNormalizationError({
      code: "invalid-station-geometry",
      severity: "error",
      sourceId,
      sourceRecordId: record.id,
      message: `${sourceLabel} records require valid EPSG:4326 Point geometry`,
    });
  }
  const [longitude, latitude] = record.geometry.coordinates;
  if (
    record.geometry.coordinates.length < 2 ||
    !record.geometry.coordinates.every(
      (ordinate) => typeof ordinate === "number" && Number.isFinite(ordinate),
    ) ||
    typeof longitude !== "number" ||
    longitude < -180 ||
    longitude > 180 ||
    typeof latitude !== "number" ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new TrafficNormalizationError({
      code: "invalid-station-geometry",
      severity: "error",
      sourceId,
      sourceRecordId: record.id,
      message: `${sourceLabel} records require valid EPSG:4326 Point geometry`,
    });
  }
}

export function requireWgs84Line(
  record: SourceRecord,
  sourceId: string,
  sourceLabel: string,
): void {
  const geometry = record.geometry;
  const lines =
    geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.type === "MultiLineString"
        ? geometry.coordinates
        : null;
  const validPosition = (position: readonly unknown[]): boolean => {
    const [longitude, latitude] = position;
    return (
      position.length >= 2 &&
      position.every(
        (ordinate) => typeof ordinate === "number" && Number.isFinite(ordinate),
      ) &&
      typeof longitude === "number" &&
      longitude >= -180 &&
      longitude <= 180 &&
      typeof latitude === "number" &&
      latitude >= -90 &&
      latitude <= 90
    );
  };
  if (
    lines === null ||
    lines.length === 0 ||
    lines.some(
      (line) => line.length < 2 || line.some((position) => !validPosition(position)),
    )
  ) {
    throw new TrafficNormalizationError({
      code: "invalid-linear-geometry",
      severity: "error",
      sourceId,
      sourceRecordId: record.id,
      message: `${sourceLabel} records require valid EPSG:4326 LineString or MultiLineString geometry`,
    });
  }
}

export function requireStationId(
  record: SourceRecord,
  sourceId: string,
): string {
  const value = record.properties.id_comptag;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TrafficNormalizationError({
      code: "missing-station-id",
      severity: "error",
      sourceId,
      sourceRecordId: record.id,
      message: "id_comptag must be a non-empty string",
    });
  }
  return value.trim();
}

export function optionalTrafficNumber(
  record: SourceRecord,
  sourceId: string,
  field: string,
  maximum?: number,
): number | null {
  const value = record.properties[field];
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    (maximum !== undefined && value > maximum)
  ) {
    const range =
      maximum === undefined ? "non-negative" : `between 0 and ${maximum}`;
    throw new TrafficNormalizationError({
      code: "invalid-traffic-value",
      severity: "error",
      sourceId,
      sourceRecordId: record.id,
      message: `${field} must be a finite ${range} number or null`,
    });
  }
  return value;
}

export function normalizeCounterType(value: unknown): CounterType {
  if (value === "permanent") return "permanent";
  if (value === "tournant") return "rotating";
  if (value === "ponctuel") return "occasional";
  return "unknown";
}

export function normalizeRoadIdentity(
  value: unknown,
): { readonly roadRef: string } | { readonly roadName: string } | {} {
  if (typeof value !== "string" || value.trim().length === 0) return {};
  const route = value.trim();
  if (/^(?:R\s*)?(?:A|N|D)\s*\d+[A-Z0-9]*$/i.test(route)) {
    return {
      roadRef: route.replace(/\s+/g, "").replace(/^R(?=[AND])/i, "").toUpperCase(),
    };
  }
  return { roadName: route };
}
