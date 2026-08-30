import { describe, expect, test } from "vitest";

import type { IgnRoadSegment } from "../../src/traffic/ign-roads.js";
import {
  buildStreetSubjects,
  extractTargetCorridors,
  normalizeStreetName,
} from "../../src/visualization/street-network.js";

function segment(
  id: string,
  names: readonly string[],
  coordinates: readonly (readonly [number, number])[],
  vehicleAccess: IgnRoadSegment["vehicleAccess"] = "free",
): IgnRoadSegment {
  return {
    id,
    names,
    geometry: {
      type: "LineString",
      coordinates: coordinates.map((position) => [...position]),
    },
    nature: "Route à 1 chaussée",
    vehicleAccess,
    inseeCodes: ["64122"],
  };
}

describe("visualization street network", () => {
  test("normalizes accents, punctuation, and only approved abbreviations", () => {
    expect(normalizeStreetName("  Avenue de Verdun ")).toBe(
      "avenue de verdun",
    );
    expect(normalizeStreetName("Av. de la Gare")).toBe("avenue de la gare");
    expect(normalizeStreetName("BD du Général-de-Gaulle")).toBe(
      "boulevard du general de gaulle",
    );
    expect(normalizeStreetName("Rue d'Espagne")).toBe("rue d espagne");
  });

  test("groups connected segments by normalized name and keeps disconnected names separate", () => {
    const subjects = buildStreetSubjects([
      segment(
        "TRON-2",
        ["Av. de Verdun"],
        [
          [-1.55, 43.48],
          [-1.54, 43.48],
        ],
        "restricted",
      ),
      segment(
        "TRON-1",
        ["Avenue de Verdun", "Av. de Verdun"],
        [
          [-1.56, 43.48],
          [-1.550005, 43.48],
        ],
      ),
      segment("TRON-3", ["Avenue de Verdun"], [
        [-1.5, 43.5],
        [-1.49, 43.5],
      ]),
      segment("TRON-4", ["Rue de Verdun"], [
        [-1.56, 43.47],
        [-1.55, 43.47],
      ]),
      segment("TRON-UNNAMED", [], [
        [-1.56, 43.46],
        [-1.55, 43.46],
      ]),
    ]);

    expect(subjects).toEqual([
      {
        id: "ign-street:avenue-de-verdun:TRON-1|TRON-2",
        displayName: "Avenue de Verdun",
        normalizedName: "avenue de verdun",
        segmentIds: ["TRON-1", "TRON-2"],
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [-1.56, 43.48],
              [-1.550005, 43.48],
            ],
            [
              [-1.55, 43.48],
              [-1.54, 43.48],
            ],
          ],
        },
        vehicleAccess: ["free", "restricted"],
        evidenceState: "no-data",
      },
      {
        id: "ign-street:avenue-de-verdun:TRON-3",
        displayName: "Avenue de Verdun",
        normalizedName: "avenue de verdun",
        segmentIds: ["TRON-3"],
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [-1.5, 43.5],
              [-1.49, 43.5],
            ],
          ],
        },
        vehicleAccess: ["free"],
        evidenceState: "no-data",
      },
      {
        id: "ign-street:rue-de-verdun:TRON-4",
        displayName: "Rue de Verdun",
        normalizedName: "rue de verdun",
        segmentIds: ["TRON-4"],
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [-1.56, 43.47],
              [-1.55, 43.47],
            ],
          ],
        },
        vehicleAccess: ["free"],
        evidenceState: "no-data",
      },
    ]);
    expect(buildStreetSubjects([...subjectsInput()].reverse())).toEqual(
      buildStreetSubjects(subjectsInput()),
    );
  });

  test("extracts both exact priority corridors without assigning traffic", () => {
    const subjects = buildStreetSubjects([
      segment("VERDUN-1", ["Avenue de Verdun"], [
        [-1.56, 43.48],
        [-1.55, 43.48],
      ]),
      segment("GARE-1", ["Avenue de la Gare"], [
        [-1.55, 43.47],
        [-1.54, 43.47],
      ]),
    ]);

    expect(extractTargetCorridors(subjects)).toEqual([
      {
        targetId: "avenue-de-la-gare",
        streetSubjectIds: ["ign-street:avenue-de-la-gare:GARE-1"],
        displayName: "Avenue de la Gare",
        reviewStatus: "pending",
      },
      {
        targetId: "avenue-de-verdun",
        streetSubjectIds: ["ign-street:avenue-de-verdun:VERDUN-1"],
        displayName: "Avenue de Verdun",
        reviewStatus: "pending",
      },
    ]);
  });

  test("rejects a missing priority corridor", () => {
    const subjects = buildStreetSubjects([
      segment("VERDUN-1", ["Avenue de Verdun"], [
        [-1.56, 43.48],
        [-1.55, 43.48],
      ]),
    ]);

    expect(() => extractTargetCorridors(subjects)).toThrow(
      "Missing IGN target corridor: Avenue de la Gare",
    );
  });
});

function subjectsInput(): readonly IgnRoadSegment[] {
  return [
    segment("A", ["Avenue de Verdun"], [
      [-1.56, 43.48],
      [-1.55, 43.48],
    ]),
    segment("B", ["Av. de Verdun"], [
      [-1.55, 43.48],
      [-1.54, 43.48],
    ]),
  ];
}
