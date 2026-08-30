import type { VisualizationBundle } from "./contracts";
import type { MapSelection } from "./map/map-controller";

type StationGroup = VisualizationBundle["stationGroups"][number];
type StreetSubject = VisualizationBundle["streetSubjects"][number];
type TargetCorridor = VisualizationBundle["targetCorridors"][number];

export type DetailViewModel =
  | {
      readonly kind: "station";
      readonly title: string;
      readonly group: StationGroup;
    }
  | {
      readonly kind: "street";
      readonly title: string;
      readonly street: StreetSubject;
      readonly candidateReview: boolean;
      readonly acceptedStationGroup: StationGroup | null;
    }
  | {
      readonly kind: "target";
      readonly title: string;
      readonly target: TargetCorridor;
    };

export function selectAvailableYears(
  bundle: VisualizationBundle,
): readonly number[] {
  return [
    ...new Set([
      ...bundle.stationGroups.flatMap((group) =>
        group.observations.map(({ year }) => year),
      ),
    ]),
  ].sort((left, right) => left - right);
}

export function selectDetail(
  bundle: VisualizationBundle,
  selection: MapSelection,
): DetailViewModel {
  if (selection.kind === "station") {
    const group = bundle.stationGroups.find(({ id }) => id === selection.id);
    if (!group) throw new Error(`Unknown station selection: ${selection.id}`);
    const roadRef = group.members.find(({ roadRef }) => roadRef)?.roadRef;
    const roadName = group.members.find(({ roadName }) => roadName)?.roadName;
    return {
      kind: "station",
      title:
        roadRef && roadName
          ? `${roadRef} · ${roadName}`
          : roadRef ?? roadName ?? "Point de comptage",
      group,
    };
  }
  if (selection.kind === "target") {
    const target = bundle.targetCorridors.find(
      ({ targetId }) => targetId === selection.id,
    );
    if (!target) throw new Error(`Unknown target selection: ${selection.id}`);
    return { kind: "target", title: target.displayName, target };
  }
  const street = bundle.streetSubjects.find(({ id }) => id === selection.id);
  if (!street) throw new Error(`Unknown street selection: ${selection.id}`);
  const assignments = bundle.streetAssignments.filter(
    ({ streetSubjectId }) => streetSubjectId === street.id,
  );
  const accepted = assignments.find(({ status }) => status === "accepted");
  return {
    kind: "street",
    title: street.displayName,
    street,
    candidateReview: assignments.some(
      ({ status }) => status === "candidate-review",
    ),
    acceptedStationGroup: accepted
      ? (bundle.stationGroups.find(({ id }) => id === accepted.stationGroupId) ??
        null)
      : null,
  };
}
