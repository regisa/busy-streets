import type { VisualizationBundle } from "./contracts";
import type { StreetGroup } from "./street-groups";

type StationGroup = VisualizationBundle["stationGroups"][number];

export interface StreetComparisonRow {
  readonly id: string;
  readonly streetGroupId: string;
  readonly streetName: string;
  readonly stationGroupId: string | null;
  readonly locationLabel: string | null;
  readonly candidateReview: boolean;
  readonly observations: StationGroup["observations"];
}

export interface StreetComparisonMatrix {
  readonly years: readonly number[];
  readonly rows: readonly StreetComparisonRow[];
}

export function selectStreetComparisonMatrix(
  bundle: VisualizationBundle,
  selectedGroups: readonly StreetGroup[],
): StreetComparisonMatrix {
  const stationGroups = new Map(
    bundle.stationGroups.map((stationGroup) => [stationGroup.id, stationGroup]),
  );
  const rows = selectedGroups.flatMap((group) => {
    const streetIds = new Set(group.streetSubjectIds);
    const assignments = bundle.streetAssignments.filter(({ streetSubjectId }) =>
      streetIds.has(streetSubjectId),
    );
    const candidateReview =
      group.targetCorridorIds.length > 0 ||
      assignments.some(({ status }) => status === "candidate-review");
    const acceptedStationIds = [
      ...new Set(
        assignments
          .filter(({ status }) => status === "accepted")
          .map(({ stationGroupId }) => stationGroupId),
      ),
    ].sort();

    if (acceptedStationIds.length === 0) {
      return [
        {
          id: `${group.id}:no-data`,
          streetGroupId: group.id,
          streetName: group.displayName,
          stationGroupId: null,
          locationLabel: null,
          candidateReview,
          observations: [],
        } satisfies StreetComparisonRow,
      ];
    }

    return acceptedStationIds.flatMap((stationGroupId): StreetComparisonRow[] => {
      const stationGroup = stationGroups.get(stationGroupId);
      if (!stationGroup) return [];
      return [
        {
          id: `${group.id}:${stationGroupId}`,
          streetGroupId: group.id,
          streetName: group.displayName,
          stationGroupId,
          locationLabel: selectLocationLabel(stationGroup),
          candidateReview,
          observations: stationGroup.observations,
        },
      ];
    });
  });

  return {
    years: [
      ...new Set(
        rows.flatMap(({ observations }) =>
          observations.map(({ year }) => year),
        ),
      ),
    ].sort((left, right) => left - right),
    rows,
  };
}

function selectLocationLabel(stationGroup: StationGroup): string {
  const roadRef = stationGroup.members.find((member) => member.roadRef)?.roadRef;
  const roadName = stationGroup.members.find((member) => member.roadName)?.roadName;
  if (roadRef && roadName) return `${roadRef} · ${roadName}`;
  return roadRef ?? roadName ?? "Point de comptage";
}
