import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import buffer from "@turf/buffer";
import { feature, lineString } from "@turf/helpers";
import length from "@turf/length";
import type {
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
} from "geojson";
import { z } from "zod";

import type {
  BiarritzGeographicFrame,
  GeographicScope,
  Wgs84BoundingBox,
} from "./contracts.js";

const positionSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);

const linearRingSchema = z
  .array(positionSchema)
  .min(4)
  .superRefine((ring, context) => {
    const first = ring[0];
    const last = ring.at(-1);

    if (first?.[0] !== last?.[0] || first?.[1] !== last?.[1]) {
      context.addIssue({
        code: "custom",
        message: "GeoJSON linear rings must be closed",
      });
    }
  });

const multiPolygonSchema = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(linearRingSchema).min(1)).min(1),
});

const biarritzBoundaryFeatureSchema = z.object({
  type: z.literal("Feature"),
  properties: z.object({
    code: z.literal("64122"),
  }),
  geometry: multiPolygonSchema,
});

export function parseBiarritzBoundary(value: unknown): MultiPolygon {
  return biarritzBoundaryFeatureSchema.parse(value).geometry;
}

export function createBiarritzGeographicFrame(
  boundary: MultiPolygon,
): BiarritzGeographicFrame {
  const buffered = buffer(feature(boundary), 2, {
    steps: 8,
    units: "kilometers",
  });

  if (buffered === undefined) {
    throw new Error("Could not derive the 2 km Biarritz buffer");
  }

  return {
    inseeCode: "64122",
    boundary,
    buffer: buffered.geometry,
    bufferKilometers: 2,
  };
}

export function classifyPointGeographicScope(
  point: Point,
  frame: BiarritzGeographicFrame,
): GeographicScope {
  if (booleanPointInPolygon(point, frame.boundary)) {
    return "inside-municipality";
  }

  if (booleanPointInPolygon(point, frame.buffer)) {
    return "buffer-only";
  }

  return "outside";
}

export function geographicFrameBoundingBox(
  frame: BiarritzGeographicFrame,
): Wgs84BoundingBox {
  const polygons =
    frame.buffer.type === "Polygon"
      ? [frame.buffer.coordinates]
      : frame.buffer.coordinates;
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const position of ring) {
        const [longitude, latitude] = readPosition2D(position);
        west = Math.min(west, longitude);
        south = Math.min(south, latitude);
        east = Math.max(east, longitude);
        north = Math.max(north, latitude);
      }
    }
  }

  if (![west, south, east, north].every(Number.isFinite)) {
    throw new Error("Biarritz buffer does not contain a valid position");
  }

  return { west, south, east, north };
}

interface MunicipalityLengths {
  readonly insideInclusive: number;
  readonly strictInside: number;
  readonly strictOutside: number;
}

function lineStringMunicipalityLengths(
  geometry: LineString,
  boundary: MultiPolygon,
): MunicipalityLengths {
  const boundaryFeature = feature(boundary);
  const boundaryEdges = boundary.coordinates.flatMap((polygon) =>
    polygon.flatMap((ring) =>
      ring.slice(1).map((end, index) => [ring[index]!, end] as const),
    ),
  );
  let insideInclusive = 0;
  let strictInside = 0;
  let strictOutside = 0;

  for (const [index, end] of geometry.coordinates.slice(1).entries()) {
    const start = readPosition2D(geometry.coordinates[index]!);
    const lineEnd = readPosition2D(end);
    const splitParameters = [0, 1];

    for (const [edgeStart, edgeEnd] of boundaryEdges) {
      splitParameters.push(
        ...segmentIntersectionParameters(
          start,
          lineEnd,
          readPosition2D(edgeStart),
          readPosition2D(edgeEnd),
        ),
      );
    }

    const orderedParameters = [...new Set(splitParameters.map(normalizeUnit))].sort(
      (left, right) => left - right,
    );

    for (const [partIndex, upper] of orderedParameters.slice(1).entries()) {
      const lower = orderedParameters[partIndex]!;
      if (upper - lower < 1e-12) continue;

      const partStart = interpolatePosition(start, lineEnd, lower);
      const partEnd = interpolatePosition(start, lineEnd, upper);
      const midpoint = {
        type: "Point" as const,
        coordinates: interpolatePosition(
          start,
          lineEnd,
          (lower + upper) / 2,
        ),
      };
      const partLength = length(lineString([partStart, partEnd]), {
        units: "kilometers",
      });

      if (
        booleanPointInPolygon(midpoint, boundaryFeature, {
          ignoreBoundary: true,
        })
      ) {
        insideInclusive += partLength;
        strictInside += partLength;
      } else if (booleanPointInPolygon(midpoint, boundaryFeature)) {
        insideInclusive += partLength;
      } else {
        strictOutside += partLength;
      }
    }
  }

  return { insideInclusive, strictInside, strictOutside };
}

type Position2D = readonly [number, number];

function readPosition2D(position: readonly number[]): Position2D {
  const longitude = position[0];
  const latitude = position[1];
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error("Line geometry contains an invalid position");
  }

  return [longitude!, latitude!];
}

function cross(left: Position2D, right: Position2D): number {
  return left[0] * right[1] - left[1] * right[0];
}

function subtract(left: Position2D, right: Position2D): Position2D {
  return [left[0] - right[0], left[1] - right[1]];
}

function segmentIntersectionParameters(
  start: Position2D,
  end: Position2D,
  edgeStart: Position2D,
  edgeEnd: Position2D,
): number[] {
  const direction = subtract(end, start);
  const edgeDirection = subtract(edgeEnd, edgeStart);
  const offset = subtract(edgeStart, start);
  const denominator = cross(direction, edgeDirection);
  const epsilon = 1e-12;

  if (Math.abs(denominator) > epsilon) {
    const lineParameter = cross(offset, edgeDirection) / denominator;
    const edgeParameter = cross(offset, direction) / denominator;
    return lineParameter >= -epsilon &&
      lineParameter <= 1 + epsilon &&
      edgeParameter >= -epsilon &&
      edgeParameter <= 1 + epsilon
      ? [normalizeUnit(lineParameter)]
      : [];
  }

  if (Math.abs(cross(offset, direction)) > epsilon) return [];

  const squaredLength =
    direction[0] * direction[0] + direction[1] * direction[1];
  if (squaredLength === 0) return [];

  return [edgeStart, edgeEnd]
    .map((position) => {
      const relative = subtract(position, start);
      return (
        (relative[0] * direction[0] + relative[1] * direction[1]) /
        squaredLength
      );
    })
    .filter((parameter) => parameter >= -epsilon && parameter <= 1 + epsilon)
    .map(normalizeUnit);
}

function normalizeUnit(value: number): number {
  if (Math.abs(value) < 1e-12) return 0;
  if (Math.abs(value - 1) < 1e-12) return 1;
  return value;
}

function interpolatePosition(
  start: Position2D,
  end: Position2D,
  parameter: number,
): [number, number] {
  return [
    start[0] + (end[0] - start[0]) * parameter,
    start[1] + (end[1] - start[1]) * parameter,
  ];
}

export function isIngressCandidate(
  stationScope: GeographicScope,
  plausibleRoadCorridor: LineString | MultiLineString,
  frame: BiarritzGeographicFrame,
): boolean {
  if (stationScope !== "buffer-only") return false;

  const corridorComponents =
    plausibleRoadCorridor.type === "LineString"
      ? [plausibleRoadCorridor]
      : plausibleRoadCorridor.coordinates.map(
          (coordinates) => lineString(coordinates).geometry,
        );
  const toleranceKilometers = 1e-6;

  return corridorComponents.some((component) => {
    const municipalityLengths = lineStringMunicipalityLengths(
      component,
      frame.boundary,
    );

    return (
      municipalityLengths.strictInside > toleranceKilometers &&
      municipalityLengths.strictOutside > toleranceKilometers
    );
  });
}
