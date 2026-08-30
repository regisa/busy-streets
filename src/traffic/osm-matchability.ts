import bearing from "@turf/bearing";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import { point } from "@turf/helpers";

import type {
  OsmMatchabilityProbe,
  RoadMatchCandidate,
  StationRoadMatchResult,
  TrafficStation,
} from "./contracts.js";
import type { OsmRoad } from "./osm-roads.js";
import { normalizeOsmRoadRef } from "./osm-roads.js";

const INITIAL_RADIUS_METERS = 75;
const EXPANDED_RADIUS_METERS = 200;
const DECISION_EPSILON = 1e-12;

export function scoreRoadMatchCandidate(
  station: TrafficStation,
  road: OsmRoad,
): RoadMatchCandidate {
  const nearest = nearestPointOnLine(road.geometry, station.location, {
    units: "meters",
  });
  const distanceMeters = nearest.properties.dist;
  const stationRoadRef = station.roadRef
    ? normalizeOsmRoadRef(station.roadRef)
    : null;
  const roadRefExact =
    stationRoadRef !== null && road.roadRefs.includes(stationRoadRef);
  const roadRefConflict =
    stationRoadRef !== null && road.roadRefs.length > 0 && !roadRefExact;
  const normalizedNameExact = namesMatch(station.roadName, road.roadName);
  const roadClassCompatible = classIsCompatible(
    stationRoadRef,
    road.highwayClass,
  );
  const localBearing = bearingAtNearestSegment(road, nearest.properties.index);
  const bearingDifferenceDegrees =
    station.bearing === undefined
      ? null
      : axialBearingDifference(station.bearing, localBearing);
  const distanceScore =
    0.4 * Math.max(0, 1 - distanceMeters / EXPANDED_RADIUS_METERS);
  const roadRefScore = roadRefExact ? 0.3 : 0;
  const roadNameScore = normalizedNameExact ? 0.15 : 0;
  const roadClassScore = roadClassCompatible ? 0.1 : 0;
  const bearingScore =
    bearingDifferenceDegrees === null
      ? 0
      : 0.05 * Math.max(0, 1 - bearingDifferenceDegrees / 45);
  const common = {
    stationId: station.id,
    osmWayId: road.osmWayId,
    distanceMeters,
    evidence: {
      distanceScore,
      roadRefExact,
      ...(roadRefConflict ? { roadRefConflict: true } : {}),
      roadRefScore,
      normalizedNameExact,
      roadNameScore,
      roadClassCompatible,
      roadClassScore,
      ...(bearingDifferenceDegrees === null
        ? {}
        : { bearingDifferenceDegrees }),
      bearingScore,
    },
  } satisfies Omit<RoadMatchCandidate, "score" | "rejectedReason">;

  if (roadRefConflict) {
    return {
      ...common,
      score: 0,
      rejectedReason: "contradictory-road-reference",
    };
  }

  return {
    ...common,
    score:
      distanceScore +
      roadRefScore +
      roadNameScore +
      roadClassScore +
      bearingScore,
  };
}

export function assessRoadMatchability(
  station: TrafficStation,
  roads: readonly OsmRoad[],
): StationRoadMatchResult {
  const scored = roads.map((road) => scoreRoadMatchCandidate(station, road));
  const withinInitialRadius = scored.filter(
    (candidate) => candidate.distanceMeters <= INITIAL_RADIUS_METERS,
  );
  const searchRadiusMeters =
    withinInitialRadius.length > 0 ? INITIAL_RADIUS_METERS : EXPANDED_RADIUS_METERS;
  const searchedCandidates =
    searchRadiusMeters === INITIAL_RADIUS_METERS
      ? withinInitialRadius
      : scored.filter(
          (candidate) => candidate.distanceMeters <= EXPANDED_RADIUS_METERS,
        );
  const rejectedCandidates = searchedCandidates.filter(
    (candidate) => candidate.rejectedReason !== undefined,
  );
  const eligible = searchedCandidates.filter(
    (candidate) => candidate.rejectedReason === undefined,
  );
  const candidates = [...eligible].sort(compareCandidates);
  const selected = candidates[0] ?? null;
  const runnerUp = candidates[1] ?? null;
  const runnerUpGap =
    selected && runnerUp ? selected.score - runnerUp.score : null;
  const classification =
    selected === null
      ? "unmatched"
      : selected.score + DECISION_EPSILON >= 0.8 &&
          (runnerUpGap === null || runnerUpGap + DECISION_EPSILON >= 0.15)
        ? "plausible"
        : "ambiguous";

  return {
    stationId: station.id,
    classification,
    searchRadiusMeters,
    selected,
    runnerUpGap,
    candidates,
    rejectedCandidates: [...rejectedCandidates].sort(compareCandidates),
  };
}

export function assessStationsRoadMatchability(
  stations: readonly TrafficStation[],
  roads: readonly OsmRoad[],
): readonly StationRoadMatchResult[] {
  const stationIds = new Set<string>();
  for (const station of stations) {
    if (stationIds.has(station.id)) {
      throw new Error("Station IDs must be unique before OSM matching");
    }
    stationIds.add(station.id);
  }
  return [...stations]
    .sort((left, right) => compareText(left.id, right.id))
    .map((station) => assessRoadMatchability(station, roads));
}

export function createOsmMatchabilityProbe(
  osmExtract: OsmMatchabilityProbe["osmExtract"],
  stations: readonly TrafficStation[],
  roads: readonly OsmRoad[],
): OsmMatchabilityProbe {
  return {
    schemaVersion: 1,
    osmExtract: { ...osmExtract },
    results: assessStationsRoadMatchability(stations, roads),
  };
}

function bearingAtNearestSegment(road: OsmRoad, index: number | undefined): number {
  const preferredIndex = Math.max(
    0,
    Math.min(index ?? 0, road.geometry.coordinates.length - 2),
  );
  const boundedIndex = nearestNonZeroSegmentIndex(road, preferredIndex);
  return bearing(
    point(road.geometry.coordinates[boundedIndex]!),
    point(road.geometry.coordinates[boundedIndex + 1]!),
  );
}

function nearestNonZeroSegmentIndex(road: OsmRoad, preferredIndex: number): number {
  for (let offset = 0; offset < road.geometry.coordinates.length - 1; offset += 1) {
    for (const candidate of [preferredIndex - offset, preferredIndex + offset]) {
      if (candidate < 0 || candidate >= road.geometry.coordinates.length - 1) continue;
      const start = road.geometry.coordinates[candidate];
      const end = road.geometry.coordinates[candidate + 1];
      if (start && end && (start[0] !== end[0] || start[1] !== end[1])) {
        return candidate;
      }
    }
  }
  throw new Error(`OSM way ${road.osmWayId} has no non-zero segment`);
}

function axialBearingDifference(left: number, right: number): number {
  const circularDifference = Math.abs(normalizeBearing(left) - normalizeBearing(right));
  const shortest = Math.min(circularDifference, 360 - circularDifference);
  return Math.min(shortest, 180 - shortest);
}

function normalizeBearing(value: number): number {
  return ((value % 360) + 360) % 360;
}

function namesMatch(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const normalize = (value: string): string =>
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  const leftNormalized = normalize(left);
  return leftNormalized.length > 0 && leftNormalized === normalize(right);
}

function classIsCompatible(
  roadRef: string | null,
  highwayClass: string,
): boolean {
  if (!roadRef) return false;
  const baseClass = highwayClass.replace(/_link$/, "");
  if (roadRef.startsWith("A")) {
    return baseClass === "motorway" || baseClass === "trunk";
  }
  if (roadRef.startsWith("N")) {
    return baseClass === "trunk" || baseClass === "primary";
  }
  if (roadRef.startsWith("D")) {
    return ["primary", "secondary", "tertiary"].includes(baseClass);
  }
  return false;
}

function compareCandidates(
  left: RoadMatchCandidate,
  right: RoadMatchCandidate,
): number {
  return (
    right.score - left.score ||
    left.distanceMeters - right.distanceMeters ||
    compareOsmIds(left.osmWayId, right.osmWayId)
  );
}

function compareOsmIds(left: string, right: string): number {
  const leftNumeric = BigInt(left);
  const rightNumeric = BigInt(right);
  return leftNumeric < rightNumeric ? -1 : leftNumeric > rightNumeric ? 1 : 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
