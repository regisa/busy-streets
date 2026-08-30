import { describe, expect, test } from "vitest";

import type { VisualizationBundle } from "../../src/visualization/contracts.js";
import {
  findStreetGroupForSelection,
  searchStreetGroups,
  selectDefaultStreetGroupIds,
  selectStreetGroups,
  type StreetGroup,
} from "../../src/visualization/street-groups.js";
import { visualizationBundleFixture } from "./fixture.js";

function bundleWithDuplicateMarne(): VisualizationBundle {
  return visualizationBundleFixture();
}

function group(name: string, aliases: readonly string[] = []): StreetGroup {
  const normalizedName = name.toLocaleLowerCase("fr");
  return {
    id: `street-name:${normalizedName}`,
    displayName: name,
    normalizedName,
    streetSubjectIds: [`street:${normalizedName}`],
    targetCorridorIds: [],
    aliases,
  };
}

describe("grouped street identity", () => {
  test("groups disconnected source subjects without losing their IDs", () => {
    const groups = selectStreetGroups(bundleWithDuplicateMarne());

    expect(groups).toContainEqual({
      id: "street-name:avenue de la marne",
      displayName: "Avenue de la Marne",
      normalizedName: "avenue de la marne",
      streetSubjectIds: ["street:marne-east", "street:marne-west"],
      targetCorridorIds: [],
      aliases: [],
    });
  });

  test("attaches targets and resolves the three defaults by normalized name", () => {
    const bundle = bundleWithDuplicateMarne();
    const groups = selectStreetGroups(bundle);

    expect(selectDefaultStreetGroupIds(groups)).toEqual([
      "street-name:avenue de verdun",
      "street-name:avenue de la marne",
      "street-name:avenue de la gare",
    ]);
    expect(
      groups.find(({ normalizedName }) => normalizedName === "avenue de la gare"),
    ).toMatchObject({
      targetCorridorIds: ["avenue-de-la-gare"],
      aliases: ["avenue de la gare du midi", "gare du midi"],
    });
    expect(
      findStreetGroupForSelection(groups, bundle, {
        kind: "target",
        id: "avenue-de-verdun",
      })?.id,
    ).toBe("street-name:avenue de verdun");
    expect(
      findStreetGroupForSelection(groups, bundle, {
        kind: "street",
        id: "street:marne-west",
      })?.id,
    ).toBe("street-name:avenue de la marne");
    expect(
      findStreetGroupForSelection(groups, bundle, {
        kind: "station",
        id: "station-group:d810",
      }),
    ).toBeNull();
  });
});

describe("street fuzzy search", () => {
  const groups = [
    group("Avenue de la Gare", ["avenue de la gare du midi", "gare du midi"]),
    group("Avenue de la Marne"),
    group("Avenue de Verdun"),
    group("Allée des Cygnes"),
    group("Rue d’Espagne"),
  ];

  test.each([
    ["verd", "Avenue de Verdun"],
    ["gare du midi", "Avenue de la Gare"],
    ["allee cyg", "Allée des Cygnes"],
    ["espagne", "Rue d’Espagne"],
    ["verdunx", "Avenue de Verdun"],
  ])("ranks %s with %s first", (query, expected) => {
    expect(searchStreetGroups(groups, query, new Set())[0]?.displayName).toBe(
      expected,
    );
  });

  test("does not apply typo matching to queries shorter than four characters", () => {
    expect(searchStreetGroups(groups, "xue", new Set())).toEqual([]);
  });

  test("excludes selected streets and caps stable empty-query results", () => {
    const manyGroups = Array.from({ length: 14 }, (_, index) =>
      group(`Rue ${String(index + 1).padStart(2, "0")}`),
    );

    const results = searchStreetGroups(
      manyGroups,
      "",
      new Set(["street-name:rue 01"]),
    );

    expect(results).toHaveLength(12);
    expect(results.map(({ displayName }) => displayName)).toEqual([
      "Rue 02",
      "Rue 03",
      "Rue 04",
      "Rue 05",
      "Rue 06",
      "Rue 07",
      "Rue 08",
      "Rue 09",
      "Rue 10",
      "Rue 11",
      "Rue 12",
      "Rue 13",
    ]);
  });
});
