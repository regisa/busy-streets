import type { VisualizationBundle } from "../../src/visualization/contracts.js";

export function visualizationBundleFixture(): VisualizationBundle {
  const ring: [number, number][] = [
    [-1.57, 43.47], [-1.53, 43.47], [-1.53, 43.5], [-1.57, 43.5], [-1.57, 43.47],
  ];
  const sourceLink = (year: number) => ({
    observationId: `observation:${year}`,
    sourceId: "dreal-2024-point",
    sourceRecordId: `record:${year}`,
    publicationDate: "2026-05-21",
  });
  return {
    schemaVersion: 1,
    asOf: "2026-08-29",
    municipalityInseeCode: "64122",
    bufferKilometers: 2,
    boundary: { type: "MultiPolygon", coordinates: [[[...ring]]] },
    buffer: { type: "Polygon", coordinates: [[...ring]] },
    sources: [{ sourceId: "dreal-2024-point", status: "audited", artifactId: "a:one" }],
    stationGroups: [{
      id: "station-group:d810",
      location: { type: "Point", coordinates: [-1.55, 43.48] },
      memberStationIds: ["station:2023", "station:2024"],
      members: [
        {
          id: "station:2023",
          sourceId: "dreal-2024-point",
          sourceRecordId: "record:station:2023",
          counterType: "rotating",
          location: { type: "Point", coordinates: [-1.5501, 43.48] },
          roadRef: "D810",
          roadName: "Biarritz",
          geographicScope: "inside-municipality",
        },
        {
          id: "station:2024",
          sourceId: "dreal-2024-point",
          sourceRecordId: "record:station:2024",
          counterType: "permanent",
          location: { type: "Point", coordinates: [-1.55, 43.48] },
          roadRef: "D810",
          roadName: "Biarritz",
          geographicScope: "inside-municipality",
        },
      ],
      observations: [
        { year: 2021, vehiclesPerDay: 30_000, heavyVehiclePercent: 3, quality: "measured", sourceLinks: [sourceLink(2021)] },
        { year: 2024, vehiclesPerDay: 32_000, heavyVehiclePercent: 3.2, quality: "measured", sourceLinks: [sourceLink(2024)] },
      ],
      issues: [{ code: "osm-match-ambiguous", severity: "warning", message: "OSM road match is ambiguous for station:2024" }],
    }],
    linearRecords: [{
      id: "linear:2023",
      sourceId: "dreal-2024-point",
      sourceRecordId: "record:linear",
      geometry: { type: "LineString", coordinates: [[-1.56, 43.48], [-1.54, 43.48]] },
      observation: {
        year: 2023,
        vehiclesPerDay: 12_000,
        heavyVehiclePercent: null,
        quality: "unknown",
        sourceLinks: [sourceLink(2023)],
      },
    }],
    streetSubjects: [
      {
        id: "street:gare",
        displayName: "Avenue de la Gare",
        normalizedName: "avenue de la gare",
        segmentIds: ["1"],
        geometry: { type: "MultiLineString", coordinates: [[[-1.56, 43.48], [-1.55, 43.48]]] },
        vehicleAccess: ["free"],
        evidenceState: "no-data",
      },
      {
        id: "street:verdun",
        displayName: "Avenue de Verdun",
        normalizedName: "avenue de verdun",
        segmentIds: ["2"],
        geometry: { type: "MultiLineString", coordinates: [[[-1.55, 43.48], [-1.54, 43.48]]] },
        vehicleAccess: ["free"],
        evidenceState: "no-data",
      },
      {
        id: "street:marne-east",
        displayName: "Avenue de la Marne",
        normalizedName: "avenue de la marne",
        segmentIds: ["3"],
        geometry: { type: "MultiLineString", coordinates: [[[-1.56, 43.49], [-1.55, 43.49]]] },
        vehicleAccess: ["free"],
        evidenceState: "no-data",
      },
      {
        id: "street:marne-west",
        displayName: "Avenue de la Marne",
        normalizedName: "avenue de la marne",
        segmentIds: ["4"],
        geometry: { type: "MultiLineString", coordinates: [[[-1.54, 43.49], [-1.53, 43.49]]] },
        vehicleAccess: ["free"],
        evidenceState: "no-data",
      },
    ],
    targetCorridors: [
      { targetId: "avenue-de-la-gare", streetSubjectIds: ["street:gare"], displayName: "Avenue de la Gare", reviewStatus: "pending" },
      { targetId: "avenue-de-verdun", streetSubjectIds: ["street:verdun"], displayName: "Avenue de Verdun", reviewStatus: "pending" },
    ],
    streetAssignments: [],
    issues: [],
  };
}
