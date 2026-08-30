import distance from "@turf/distance";

import type {
  ContinuityCandidate,
  TrafficStation,
} from "./contracts.js";

export function findStationContinuityCandidates(
  stations: readonly TrafficStation[],
): readonly ContinuityCandidate[] {
  const orderedStations = [...stations].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  for (let index = 1; index < orderedStations.length; index += 1) {
    if (orderedStations[index - 1]?.id === orderedStations[index]?.id) {
      throw new Error("Station IDs must be unique before continuity scoring");
    }
  }
  const candidates: ContinuityCandidate[] = [];
  for (let leftIndex = 0; leftIndex < orderedStations.length; leftIndex += 1) {
    const left = orderedStations[leftIndex];
    if (!left) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < orderedStations.length;
      rightIndex += 1
    ) {
      const right = orderedStations[rightIndex];
      if (!right) continue;
      const candidate = scoreStationContinuity(left, right);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates;
}

export function scoreStationContinuity(
  leftInput: TrafficStation,
  rightInput: TrafficStation,
): ContinuityCandidate | null {
  if (leftInput.id === rightInput.id) {
    throw new Error("Continuity scoring requires two distinct station IDs");
  }
  const [left, right] =
    leftInput.id.localeCompare(rightInput.id) <= 0
      ? [leftInput, rightInput]
      : [rightInput, leftInput];
  const distanceMeters = distance(left.location, right.location, {
    units: "meters",
  });
  if (distanceMeters > 150) return null;

  const externalIdExact =
    left.sourceStationId !== undefined &&
    right.sourceStationId !== undefined &&
    left.sourceStationId === right.sourceStationId;
  const leftRoadRef = normalizeRoadRef(left.roadRef);
  const rightRoadRef = normalizeRoadRef(right.roadRef);
  const roadRefExact =
    leftRoadRef !== null &&
    rightRoadRef !== null &&
    leftRoadRef === rightRoadRef;
  const leftRoadName = normalizeRoadName(left.roadName);
  const rightRoadName = normalizeRoadName(right.roadName);
  const normalizedNameExact =
    leftRoadName !== null &&
    rightRoadName !== null &&
    leftRoadName === rightRoadName;
  const counterTypeExact =
    left.counterType !== "unknown" && left.counterType === right.counterType;
  if (
    leftRoadRef !== null &&
    rightRoadRef !== null &&
    leftRoadRef !== rightRoadRef
  ) {
    return {
      leftStationId: left.id,
      rightStationId: right.id,
      score: 0,
      classification: "separate",
      distanceMeters,
      rejectedReason: "contradictory-road-reference",
      evidence: {
        externalIdExact,
        roadRefExact: false,
        roadRefConflict: true,
        withinDistance: true,
        normalizedNameExact,
        counterTypeExact,
      },
    };
  }
  const score = roundScore(
    (externalIdExact ? 0.4 : 0) +
      (roadRefExact ? 0.25 : 0) +
      0.2 +
      (normalizedNameExact ? 0.1 : 0) +
      (counterTypeExact ? 0.05 : 0),
  );

  return {
    leftStationId: left.id,
    rightStationId: right.id,
    score,
    classification:
      score >= 0.85 ? "probable" : score >= 0.65 ? "review" : "separate",
    distanceMeters,
    evidence: {
      externalIdExact,
      roadRefExact,
      withinDistance: true,
      normalizedNameExact,
      counterTypeExact,
    },
  };
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeRoadName(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return normalized.length > 0 ? normalized : null;
}

function normalizeRoadRef(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  return normalized.length > 0 ? normalized : null;
}
