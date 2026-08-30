import type {
  ContinuityCandidate,
  GeographicTrafficStation,
} from "./contracts.js";

export interface StationGroup {
  readonly id: string;
  readonly memberStationIds: readonly string[];
}

export function buildStationGroups(
  stations: readonly GeographicTrafficStation[],
  candidates: readonly ContinuityCandidate[],
): readonly StationGroup[] {
  const parents = new Map<string, string>();
  for (const station of stations) {
    if (parents.has(station.id)) {
      throw new Error(`Duplicate station group member: ${station.id}`);
    }
    parents.set(station.id, station.id);
  }

  const find = (stationId: string): string => {
    const parent = parents.get(stationId);
    if (!parent) throw new Error(`Unknown continuity station: ${stationId}`);
    if (parent === stationId) return parent;
    const root = find(parent);
    parents.set(stationId, root);
    return root;
  };
  const union = (leftStationId: string, rightStationId: string): void => {
    const leftRoot = find(leftStationId);
    const rightRoot = find(rightStationId);
    if (leftRoot === rightRoot) return;
    const roots = [leftRoot, rightRoot].sort((left, right) =>
      left.localeCompare(right),
    );
    const first = roots[0];
    const second = roots[1];
    if (!first || !second) throw new Error("Continuity group roots are missing");
    parents.set(second, first);
  };

  for (const candidate of candidates) {
    find(candidate.leftStationId);
    find(candidate.rightStationId);
    if (candidate.classification === "probable") {
      union(candidate.leftStationId, candidate.rightStationId);
    }
  }

  const membersByRoot = new Map<string, string[]>();
  for (const station of stations) {
    const root = find(station.id);
    const members = membersByRoot.get(root) ?? [];
    members.push(station.id);
    membersByRoot.set(root, members);
  }

  return [...membersByRoot.values()]
    .map((memberStationIds) => {
      memberStationIds.sort((left, right) => left.localeCompare(right));
      return {
        id: `station-group:${memberStationIds.join("|")}`,
        memberStationIds,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
