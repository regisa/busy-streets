import { describe, expect, test } from "vitest";

import { visualizationBundleSchema } from "../../src/visualization/contracts.js";

function validBundle(): Record<string, unknown> {
  const ring = [
    [-1.57, 43.47],
    [-1.53, 43.47],
    [-1.53, 43.5],
    [-1.57, 43.5],
    [-1.57, 43.47],
  ];
  return {
    schemaVersion: 1,
    asOf: "2026-08-29",
    municipalityInseeCode: "64122",
    bufferKilometers: 2,
    boundary: { type: "MultiPolygon", coordinates: [[[...ring]]] },
    buffer: { type: "Polygon", coordinates: [[...ring]] },
    sources: [
      {
        sourceId: "dreal-2024-point",
        status: "audited",
        artifactId: "artifact:point",
      },
    ],
    stationGroups: [
      {
        id: "station-group:one",
        location: { type: "Point", coordinates: [-1.55, 43.48] },
        memberStationIds: ["station:one"],
        members: [
          {
            id: "station:one",
            sourceId: "dreal-2024-point",
            sourceRecordId: "record:station",
            counterType: "permanent",
            location: { type: "Point", coordinates: [-1.55, 43.48] },
            geographicScope: "inside-municipality",
          },
        ],
        observations: [
          {
            year: 2024,
            vehiclesPerDay: 32_000,
            heavyVehiclePercent: 3.2,
            quality: "measured",
            sourceLinks: [
              {
                observationId: "observation:one",
                sourceId: "dreal-2024-point",
                sourceRecordId: "record:observation",
                publicationDate: "2026-05-21",
              },
            ],
          },
        ],
        issues: [],
      },
    ],
    linearRecords: [],
    streetSubjects: [
      {
        id: "ign-street:avenue-de-verdun:1",
        displayName: "Avenue de Verdun",
        normalizedName: "avenue de verdun",
        segmentIds: ["1"],
        geometry: {
          type: "MultiLineString",
          coordinates: [[[-1.56, 43.48], [-1.55, 43.48]]],
        },
        vehicleAccess: ["free"],
        evidenceState: "no-data",
      },
      {
        id: "ign-street:avenue-de-la-gare:2",
        displayName: "Avenue de la Gare",
        normalizedName: "avenue de la gare",
        segmentIds: ["2"],
        geometry: {
          type: "MultiLineString",
          coordinates: [[[-1.55, 43.47], [-1.54, 43.47]]],
        },
        vehicleAccess: ["free"],
        evidenceState: "no-data",
      },
    ],
    targetCorridors: [
      {
        targetId: "avenue-de-la-gare",
        streetSubjectIds: ["ign-street:avenue-de-la-gare:2"],
        displayName: "Avenue de la Gare",
        reviewStatus: "pending",
      },
      {
        targetId: "avenue-de-verdun",
        streetSubjectIds: ["ign-street:avenue-de-verdun:1"],
        displayName: "Avenue de Verdun",
        reviewStatus: "pending",
      },
    ],
    streetAssignments: [],
    issues: [],
  };
}

describe("visualization bundle contract", () => {
  test("accepts a valid Biarritz Phase 1 bundle", () => {
    expect(visualizationBundleSchema.parse(validBundle())).toBeTruthy();
  });

  test("rejects wrong-city bundles and duplicate station group IDs", () => {
    expect(() =>
      visualizationBundleSchema.parse({
        ...validBundle(),
        municipalityInseeCode: "75056",
      }),
    ).toThrow();

    const duplicate = validBundle();
    duplicate.stationGroups = [
      ...(duplicate.stationGroups as unknown[]),
      (duplicate.stationGroups as unknown[])[0],
    ];
    expect(() => visualizationBundleSchema.parse(duplicate)).toThrow(
      "Duplicate station group ID",
    );
  });

  test("rejects interpolation and unknown observation source links", () => {
    const interpolated = validBundle();
    const group = (interpolated.stationGroups as Record<string, unknown>[])[0]!;
    const observation = (group.observations as Record<string, unknown>[])[0]!;
    observation.quality = "interpolated";
    expect(() => visualizationBundleSchema.parse(interpolated)).toThrow(
      "interpolated",
    );

    const unknownSource = validBundle();
    const unknownGroup = (
      unknownSource.stationGroups as Record<string, unknown>[]
    )[0]!;
    const unknownObservation = (
      unknownGroup.observations as Record<string, unknown>[]
    )[0]!;
    const sourceLink = (
      unknownObservation.sourceLinks as Record<string, unknown>[]
    )[0]!;
    sourceLink.sourceId = "unknown-source";
    expect(() => visualizationBundleSchema.parse(unknownSource)).toThrow(
      "Unknown observation source link",
    );
  });

  test("rejects invalid GeoJSON coordinates and broken assignments", () => {
    const invalidCoordinate = validBundle();
    const subject = (
      invalidCoordinate.streetSubjects as Record<string, unknown>[]
    )[0]!;
    const geometry = subject.geometry as Record<string, unknown>;
    geometry.coordinates = [[[Number.NaN, 43.48], [-1.55, 43.48]]];
    expect(() => visualizationBundleSchema.parse(invalidCoordinate)).toThrow();

    const brokenAssignment = validBundle();
    brokenAssignment.streetAssignments = [
      {
        id: "assignment:one",
        streetSubjectId: "missing-street",
        stationGroupId: "station-group:one",
        status: "candidate-review",
        evidenceSource: "osm-probe",
        evidenceReference: "osm:ambiguous",
      },
    ];
    expect(() => visualizationBundleSchema.parse(brokenAssignment)).toThrow(
      "Unknown assignment street subject",
    );
  });
});
