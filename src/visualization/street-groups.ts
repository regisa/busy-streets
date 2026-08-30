import type { VisualizationBundle } from "./contracts";
import type { MapSelection } from "./map/map-controller";

export interface StreetGroup {
  readonly id: string;
  readonly displayName: string;
  readonly normalizedName: string;
  readonly streetSubjectIds: readonly string[];
  readonly targetCorridorIds: readonly string[];
  readonly aliases: readonly string[];
}

export const DEFAULT_STREET_NAMES = [
  "avenue de verdun",
  "avenue de la marne",
  "avenue de la gare",
] as const;

interface StreetGroupBuilder {
  displayName: string;
  readonly normalizedName: string;
  readonly streetSubjectIds: string[];
  readonly targetCorridorIds: string[];
}

interface RankedStreetGroup {
  readonly group: StreetGroup;
  readonly matchClass: number;
  readonly editDistance: number;
}

export function selectStreetGroups(
  bundle: VisualizationBundle,
): readonly StreetGroup[] {
  const builders = new Map<string, StreetGroupBuilder>();
  for (const street of bundle.streetSubjects) {
    const existing = builders.get(street.normalizedName);
    if (existing) {
      existing.streetSubjectIds.push(street.id);
      if (street.displayName.localeCompare(existing.displayName, "fr") < 0) {
        existing.displayName = street.displayName;
      }
      continue;
    }
    builders.set(street.normalizedName, {
      displayName: street.displayName,
      normalizedName: street.normalizedName,
      streetSubjectIds: [street.id],
      targetCorridorIds: [],
    });
  }

  for (const target of bundle.targetCorridors) {
    const targetStreetIds = new Set(target.streetSubjectIds);
    for (const builder of builders.values()) {
      if (builder.streetSubjectIds.some((id) => targetStreetIds.has(id))) {
        builder.targetCorridorIds.push(target.targetId);
      }
    }
  }

  return [...builders.values()]
    .map((builder): StreetGroup => ({
      id: `street-name:${builder.normalizedName}`,
      displayName: builder.displayName,
      normalizedName: builder.normalizedName,
      streetSubjectIds: [...builder.streetSubjectIds].sort(),
      targetCorridorIds: [...builder.targetCorridorIds].sort(),
      aliases:
        builder.normalizedName === "avenue de la gare"
          ? ["avenue de la gare du midi", "gare du midi"]
          : [],
    }))
    .sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName, "fr") ||
        left.id.localeCompare(right.id),
    );
}

export function selectDefaultStreetGroupIds(
  groups: readonly StreetGroup[],
): readonly string[] {
  const byName = new Map(groups.map((group) => [group.normalizedName, group.id]));
  return DEFAULT_STREET_NAMES.flatMap((name) => {
    const id = byName.get(name);
    return id ? [id] : [];
  });
}

export function findStreetGroupForSelection(
  groups: readonly StreetGroup[],
  bundle: VisualizationBundle,
  selection: MapSelection,
): StreetGroup | null {
  if (selection.kind === "street") {
    return (
      groups.find(({ streetSubjectIds }) =>
        streetSubjectIds.includes(selection.id),
      ) ?? null
    );
  }
  if (selection.kind === "target") {
    const target = bundle.targetCorridors.find(
      ({ targetId }) => targetId === selection.id,
    );
    if (!target) return null;
    return (
      groups.find(({ streetSubjectIds }) =>
        streetSubjectIds.some((id) => target.streetSubjectIds.includes(id)),
      ) ?? null
    );
  }
  return null;
}

export function searchStreetGroups(
  groups: readonly StreetGroup[],
  query: string,
  selectedIds: ReadonlySet<string>,
  limit = 12,
): readonly StreetGroup[] {
  const normalizedQuery = normalizeSearchText(query);
  const available = groups.filter(({ id }) => !selectedIds.has(id));
  if (!normalizedQuery) {
    return [...available]
      .sort(compareStreetGroups)
      .slice(0, limit);
  }

  return available
    .flatMap((group): RankedStreetGroup[] => {
      const ranking = bestRanking(group, normalizedQuery);
      return ranking ? [{ group, ...ranking }] : [];
    })
    .sort(
      (left, right) =>
        left.matchClass - right.matchClass ||
        left.editDistance - right.editDistance ||
        compareStreetGroups(left.group, right.group),
    )
    .slice(0, limit)
    .map(({ group }) => group);
}

function bestRanking(
  group: StreetGroup,
  query: string,
): Omit<RankedStreetGroup, "group"> | null {
  const candidates = [group.displayName, ...group.aliases].map(normalizeSearchText);
  let best: Omit<RankedStreetGroup, "group"> | null = null;
  for (const candidate of candidates) {
    const ranking = rankCandidate(candidate, query);
    if (
      ranking &&
      (!best ||
        ranking.matchClass < best.matchClass ||
        (ranking.matchClass === best.matchClass &&
          ranking.editDistance < best.editDistance))
    ) {
      best = ranking;
    }
  }
  return best;
}

function rankCandidate(
  candidate: string,
  query: string,
): Omit<RankedStreetGroup, "group"> | null {
  if (candidate === query) return { matchClass: 0, editDistance: 0 };
  if (candidate.startsWith(query)) return { matchClass: 1, editDistance: 0 };
  if (tokensMatchInOrder(candidate.split(" "), query.split(" "))) {
    return { matchClass: 2, editDistance: 0 };
  }
  if (candidate.includes(query)) return { matchClass: 3, editDistance: 0 };

  const maximumDistance =
    query.length < 4 ? 0 : query.length < 8 ? 1 : 2;
  if (maximumDistance === 0) return null;
  const distance = Math.min(
    levenshteinDistance(candidate, query),
    ...candidate.split(" ").map((token) => levenshteinDistance(token, query)),
  );
  return distance <= maximumDistance
    ? { matchClass: 4, editDistance: distance }
    : null;
}

function tokensMatchInOrder(
  candidateTokens: readonly string[],
  queryTokens: readonly string[],
): boolean {
  let candidateIndex = 0;
  for (const queryToken of queryTokens) {
    while (
      candidateIndex < candidateTokens.length &&
      !candidateTokens[candidateIndex]!.startsWith(queryToken)
    ) {
      candidateIndex += 1;
    }
    if (candidateIndex === candidateTokens.length) return false;
    candidateIndex += 1;
  }
  return true;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compareStreetGroups(left: StreetGroup, right: StreetGroup): number {
  return (
    left.displayName.localeCompare(right.displayName, "fr") ||
    left.id.localeCompare(right.id)
  );
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}
