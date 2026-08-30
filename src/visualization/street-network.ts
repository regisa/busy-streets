import distance from "@turf/distance";

import type { MultiLineString, Position } from "geojson";

import type { IgnRoadSegment } from "../traffic/ign-roads.js";

export type StreetEvidenceState =
  | "data-available"
  | "candidate-review"
  | "no-data";

export interface StreetSubject {
  readonly id: string;
  readonly displayName: string;
  readonly normalizedName: string;
  readonly segmentIds: readonly string[];
  readonly geometry: MultiLineString;
  readonly vehicleAccess: readonly IgnRoadSegment["vehicleAccess"][];
  readonly evidenceState: StreetEvidenceState;
}

export interface TargetCorridor {
  readonly targetId: "avenue-de-la-gare" | "avenue-de-verdun";
  readonly streetSubjectIds: readonly string[];
  readonly displayName: "Avenue de la Gare" | "Avenue de Verdun";
  readonly reviewStatus: "pending";
}

interface NamedSegment {
  readonly segment: IgnRoadSegment;
  readonly displayNames: readonly string[];
}

export function normalizeStreetName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/^av\.?\s+/, "avenue ")
    .replace(/^bd\.?\s+/, "boulevard ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildStreetSubjects(
  segments: readonly IgnRoadSegment[],
): readonly StreetSubject[] {
  const segmentsByName = new Map<string, Map<string, NamedSegment>>();

  for (const segment of segments) {
    for (const originalName of segment.names) {
      const normalizedName = normalizeStreetName(originalName);
      if (normalizedName.length === 0) continue;
      const namedSegments = segmentsByName.get(normalizedName) ?? new Map();
      const existing = namedSegments.get(segment.id);
      namedSegments.set(segment.id, {
        segment,
        displayNames: [...new Set([...(existing?.displayNames ?? []), originalName])],
      });
      segmentsByName.set(normalizedName, namedSegments);
    }
  }

  const subjects: StreetSubject[] = [];
  for (const [normalizedName, segmentMap] of segmentsByName) {
    const namedSegments = [...segmentMap.values()].sort((left, right) =>
      left.segment.id.localeCompare(right.segment.id),
    );
    for (const component of connectedComponents(namedSegments)) {
      const ordered = [...component].sort((left, right) =>
        left.segment.id.localeCompare(right.segment.id),
      );
      const segmentIds = ordered.map(({ segment }) => segment.id);
      const displayName = chooseDisplayName(
        ordered.flatMap(({ displayNames }) => displayNames),
      );
      subjects.push({
        id: `ign-street:${slug(normalizedName)}:${segmentIds.join("|")}`,
        displayName,
        normalizedName,
        segmentIds,
        geometry: {
          type: "MultiLineString",
          coordinates: ordered.map(({ segment }) =>
            segment.geometry.coordinates.map((position) => [...position]),
          ),
        },
        vehicleAccess: [
          ...new Set(ordered.map(({ segment }) => segment.vehicleAccess)),
        ].sort(),
        evidenceState: "no-data",
      });
    }
  }

  return subjects.sort((left, right) => left.id.localeCompare(right.id));
}

export function extractTargetCorridors(
  subjects: readonly StreetSubject[],
): readonly TargetCorridor[] {
  const definitions = [
    {
      targetId: "avenue-de-la-gare",
      normalizedName: "avenue de la gare",
      displayName: "Avenue de la Gare",
    },
    {
      targetId: "avenue-de-verdun",
      normalizedName: "avenue de verdun",
      displayName: "Avenue de Verdun",
    },
  ] as const;

  return definitions.map((definition) => {
    const streetSubjectIds = subjects
      .filter(
        ({ normalizedName }) => normalizedName === definition.normalizedName,
      )
      .map(({ id }) => id)
      .sort();
    if (streetSubjectIds.length === 0) {
      throw new Error(`Missing IGN target corridor: ${definition.displayName}`);
    }
    return {
      targetId: definition.targetId,
      streetSubjectIds,
      displayName: definition.displayName,
      reviewStatus: "pending",
    };
  });
}

function connectedComponents(
  namedSegments: readonly NamedSegment[],
): readonly (readonly NamedSegment[])[] {
  const parents = namedSegments.map((_, index) => index);
  const find = (index: number): number => {
    const parent = parents[index];
    if (parent === undefined) throw new Error("Invalid street component index");
    if (parent === index) return index;
    const root = find(parent);
    parents[index] = root;
    return root;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };

  for (let left = 0; left < namedSegments.length; left += 1) {
    const leftSegment = namedSegments[left];
    if (!leftSegment) continue;
    for (let right = left + 1; right < namedSegments.length; right += 1) {
      const rightSegment = namedSegments[right];
      if (!rightSegment) continue;
      if (endpointsTouch(leftSegment.segment, rightSegment.segment)) {
        union(left, right);
      }
    }
  }

  const components = new Map<number, NamedSegment[]>();
  for (let index = 0; index < namedSegments.length; index += 1) {
    const namedSegment = namedSegments[index];
    if (!namedSegment) continue;
    const root = find(index);
    const component = components.get(root) ?? [];
    component.push(namedSegment);
    components.set(root, component);
  }
  return [...components.values()];
}

function endpointsTouch(
  left: IgnRoadSegment,
  right: IgnRoadSegment,
): boolean {
  const leftEndpoints = endpoints(left.geometry.coordinates);
  const rightEndpoints = endpoints(right.geometry.coordinates);
  return leftEndpoints.some((leftEndpoint) =>
    rightEndpoints.some(
      (rightEndpoint) =>
        distance(leftEndpoint, rightEndpoint, { units: "meters" }) <= 1,
    ),
  );
}

function endpoints(coordinates: readonly Position[]): readonly Position[] {
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (!first || !last) throw new Error("IGN road segment has no endpoints");
  return [first, last];
}

function chooseDisplayName(names: readonly string[]): string {
  const unique = [...new Set(names.map((name) => name.trim()))];
  unique.sort((left, right) => {
    const abbreviationDifference =
      abbreviationPenalty(left) - abbreviationPenalty(right);
    if (abbreviationDifference !== 0) return abbreviationDifference;
    const lengthDifference = right.length - left.length;
    return lengthDifference !== 0
      ? lengthDifference
      : left.localeCompare(right, "fr");
  });
  const displayName = unique[0];
  if (!displayName) throw new Error("Named street has no display name");
  return displayName;
}

function abbreviationPenalty(name: string): number {
  return /^(?:av|bd)\.?\s/i.test(name) ? 1 : 0;
}

function slug(value: string): string {
  return value.replace(/\s+/g, "-");
}
