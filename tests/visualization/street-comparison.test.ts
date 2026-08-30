import { describe, expect, test } from "vitest";

import type { VisualizationBundle } from "../../src/visualization/contracts.js";
import {
  selectStreetComparisonMatrix,
  type StreetComparisonMatrix,
} from "../../src/visualization/street-comparison.js";
import type { StreetGroup } from "../../src/visualization/street-groups.js";
import { visualizationBundleFixture } from "./fixture.js";

function group(
  id: string,
  displayName: string,
  streetSubjectIds: readonly string[],
  targetCorridorIds: readonly string[] = [],
): StreetGroup {
  return {
    id,
    displayName,
    normalizedName: displayName.toLocaleLowerCase("fr"),
    streetSubjectIds,
    targetCorridorIds,
    aliases: [],
  };
}

function comparisonFixture(): {
  bundle: VisualizationBundle;
  groups: readonly StreetGroup[];
} {
  const bundle = visualizationBundleFixture();
  const secondStation = structuredClone(bundle.stationGroups[0]!);
  secondStation.id = "station-group:south";
  secondStation.memberStationIds = ["station:south:2023", "station:south:2024"];
  secondStation.members = secondStation.members.map((member, index) => ({
    ...member,
    id: secondStation.memberStationIds[index]!,
    sourceRecordId: `record:south:${index}`,
    roadRef: "D911",
    roadName: "Sud",
  }));
  secondStation.observations = secondStation.observations.map((observation) => ({
    ...observation,
    vehiclesPerDay: (observation.vehiclesPerDay ?? 0) / 2,
  }));
  bundle.stationGroups.push(secondStation);

  const template = bundle.streetSubjects[0]!;
  bundle.streetSubjects.push(
    {
      ...structuredClone(template),
      id: "street:empty",
      displayName: "Avenue sans données",
      normalizedName: "avenue sans donnees",
      segmentIds: ["empty"],
    },
    {
      ...structuredClone(template),
      id: "street:candidate",
      displayName: "Avenue candidate",
      normalizedName: "avenue candidate",
      segmentIds: ["candidate"],
    },
    {
      ...structuredClone(template),
      id: "street:double-east",
      displayName: "Avenue doublée",
      normalizedName: "avenue doublee",
      segmentIds: ["double-east"],
    },
    {
      ...structuredClone(template),
      id: "street:double-west",
      displayName: "Avenue doublée",
      normalizedName: "avenue doublee",
      segmentIds: ["double-west"],
    },
  );
  bundle.streetAssignments.push(
    {
      id: "assignment:candidate",
      streetSubjectId: "street:candidate",
      stationGroupId: "station-group:d810",
      status: "candidate-review",
      evidenceSource: "osm-probe",
      evidenceReference: "candidate:1",
    },
    {
      id: "assignment:double-east",
      streetSubjectId: "street:double-east",
      stationGroupId: "station-group:d810",
      status: "accepted",
      evidenceSource: "manual-review",
      evidenceReference: "review:1",
    },
    {
      id: "assignment:double-west",
      streetSubjectId: "street:double-west",
      stationGroupId: "station-group:d810",
      status: "accepted",
      evidenceSource: "manual-review",
      evidenceReference: "review:2",
    },
    {
      id: "assignment:verdun-north",
      streetSubjectId: "street:verdun",
      stationGroupId: "station-group:d810",
      status: "accepted",
      evidenceSource: "manual-review",
      evidenceReference: "review:3",
    },
    {
      id: "assignment:verdun-south",
      streetSubjectId: "street:verdun",
      stationGroupId: "station-group:south",
      status: "accepted",
      evidenceSource: "manual-review",
      evidenceReference: "review:4",
    },
  );

  return {
    bundle,
    groups: [
      group("street-name:empty", "Avenue sans données", ["street:empty"]),
      group("street-name:candidate", "Avenue candidate", ["street:candidate"]),
      group("street-name:double", "Avenue doublée", [
        "street:double-east",
        "street:double-west",
      ]),
      group(
        "street-name:verdun",
        "Avenue de Verdun",
        ["street:verdun"],
        ["avenue-de-verdun"],
      ),
    ],
  };
}

function rowsFor(matrix: StreetComparisonMatrix, streetName: string) {
  return matrix.rows.filter((row) => row.streetName === streetName);
}

describe("street comparison matrix", () => {
  test("keeps empty and candidate-only streets visibly empty", () => {
    const { bundle, groups } = comparisonFixture();
    const matrix = selectStreetComparisonMatrix(bundle, groups.slice(0, 2));

    expect(matrix.years).toEqual([]);
    expect(rowsFor(matrix, "Avenue sans données")).toMatchObject([
      { stationGroupId: null, candidateReview: false, observations: [] },
    ]);
    expect(rowsFor(matrix, "Avenue candidate")).toMatchObject([
      { stationGroupId: null, candidateReview: true, observations: [] },
    ]);
  });

  test("deduplicates one accepted counter linked to two source subjects", () => {
    const { bundle, groups } = comparisonFixture();
    const matrix = selectStreetComparisonMatrix(bundle, [groups[2]!]);

    expect(matrix.years).toEqual([2021, 2024]);
    expect(rowsFor(matrix, "Avenue doublée")).toHaveLength(1);
    expect(rowsFor(matrix, "Avenue doublée")[0]).toMatchObject({
      stationGroupId: "station-group:d810",
      locationLabel: "D810 · Biarritz",
      candidateReview: false,
    });
  });

  test("keeps independent accepted counters as attributable rows", () => {
    const { bundle, groups } = comparisonFixture();
    const matrix = selectStreetComparisonMatrix(bundle, [groups[3]!]);

    const rows = rowsFor(matrix, "Avenue de Verdun");
    expect(rows).toHaveLength(2);
    expect(rows.map(({ stationGroupId }) => stationGroupId)).toEqual([
      "station-group:d810",
      "station-group:south",
    ]);
    expect(rows.map(({ locationLabel }) => locationLabel)).toEqual([
      "D810 · Biarritz",
      "D911 · Sud",
    ]);
    expect(rows[0]?.observations[0]).toMatchObject({
      year: 2021,
      vehiclesPerDay: 30_000,
      quality: "measured",
    });
    expect(rows[1]?.observations[0]).toMatchObject({
      year: 2021,
      vehiclesPerDay: 15_000,
      quality: "measured",
    });
  });

  test("preserves selected street order before station order", () => {
    const { bundle, groups } = comparisonFixture();
    const selected = [groups[3]!, groups[0]!, groups[2]!];
    const matrix = selectStreetComparisonMatrix(bundle, selected);

    expect(matrix.rows.map(({ streetName }) => streetName)).toEqual([
      "Avenue de Verdun",
      "Avenue de Verdun",
      "Avenue sans données",
      "Avenue doublée",
    ]);
  });
});
