import { describe, expect, test } from "vitest";

import type { AuditEvidenceSnapshot } from "../../src/traffic/audit-evidence.js";
import type { IgnRoadArtifact } from "../../src/traffic/ign-roads.js";
import type { ReconciledTrafficObservation } from "../../src/traffic/reconciliation.js";
import {
  buildVisualizationBundle,
  serializeVisualizationBundle,
} from "../../src/visualization/bundle.js";
import type {
  StreetSubject,
  TargetCorridor,
} from "../../src/visualization/street-network.js";

const ring = [
  [-1.57, 43.47],
  [-1.53, 43.47],
  [-1.53, 43.5],
  [-1.57, 43.5],
  [-1.57, 43.47],
];

function reconciled(
  subjectId: string,
  year: number,
  sourceId: string,
  value: number,
): ReconciledTrafficObservation {
  const variant = {
    vehiclesPerDay: value,
    heavyVehiclePercent: 3,
    quality: "measured" as const,
    latestPublicationDate: sourceId === "dreal-2024-point" ? "2026-05-21" : "2025-04-10",
    sourceLinks: [
      {
        observationId: `observation:${year}`,
        sourceId,
        sourceRecordId: `record:${year}`,
        publicationDate: sourceId === "dreal-2024-point" ? "2026-05-21" : "2025-04-10",
      },
    ],
  };
  return {
    subjectId,
    year,
    periodType: "annual",
    variants: [variant],
    resolution: "canonical",
    canonical: variant,
    comparisonValue: {
      vehiclesPerDay: value,
      heavyVehiclePercent: 3,
      quality: "measured",
    },
  };
}

function fixture(): {
  audit: AuditEvidenceSnapshot;
  ignArtifact: IgnRoadArtifact;
  streets: readonly StreetSubject[];
  targets: readonly TargetCorridor[];
} {
  const groupId = "station-group:station:2023|station:2024";
  const canonical2021 = reconciled(groupId, 2021, "dreal-2019-2023-point", 30_000);
  const canonical2024 = reconciled(groupId, 2024, "dreal-2024-point", 32_000);
  const conflict = {
    ...reconciled(groupId, 2022, "dreal-2019-2023-point", 31_000),
    resolution: "unresolved-conflict" as const,
    canonical: null,
    comparisonValue: null,
  };
  const stations = [
    {
      kind: "station" as const,
      id: "station:2023",
      sourceId: "dreal-2019-2023-point",
      sourceRecordId: "record:station:2023",
      counterType: "rotating" as const,
      location: { type: "Point" as const, coordinates: [-1.56, 43.48] },
      roadRef: "D810",
      geographicScope: "inside-municipality" as const,
    },
    {
      kind: "station" as const,
      id: "station:2024",
      sourceId: "dreal-2024-point",
      sourceRecordId: "record:station:2024",
      counterType: "permanent" as const,
      location: { type: "Point" as const, coordinates: [-1.55, 43.49] },
      roadRef: "D810",
      geographicScope: "inside-municipality" as const,
    },
  ];
  const linear = {
    kind: "linear-traffic" as const,
    id: "linear:2023:one",
    sourceId: "dreal-2023-linear",
    sourceRecordId: "record:linear",
    geometry: {
      type: "LineString" as const,
      coordinates: [[-1.58, 43.48], [-1.52, 43.48]],
    },
    observation: {
      id: "observation:linear",
      sourceRecordId: "record:linear",
      sourceGeometryId: "linear:2023:one",
      year: 2023,
      periodType: "annual" as const,
      vehiclesPerDay: 10_000,
      heavyVehiclePercent: null,
      quality: "unknown" as const,
      sourceId: "dreal-2023-linear",
    },
    geographicCoverage: {
      municipalityIntersects: true,
      bufferIntersects: true,
      lengthInsideMunicipalityKilometers: 1,
    },
  };
  const audit: AuditEvidenceSnapshot = {
    config: {
      asOf: "2026-08-29",
      cacheDirectory: "/tmp/cache",
      outputDirectory: "/tmp/output",
      boundaryInseeCode: "64122",
      bufferKilometers: 2,
    },
    frame: {
      inseeCode: "64122",
      boundary: { type: "MultiPolygon", coordinates: [[[...ring]]] },
      buffer: { type: "Polygon", coordinates: [[...ring]] },
      bufferKilometers: 2,
    },
    sources: [
      { sourceId: "dreal-2024-point", status: "audited", artifactId: "a:2024" },
      { sourceId: "dreal-2023-linear", status: "audited", artifactId: "a:linear" },
      { sourceId: "dreal-2019-2023-point", status: "audited", artifactId: "a:2023" },
    ],
    evidence: [linear, ...stations].reverse(),
    inScopeStations: [...stations].reverse(),
    stationGroups: [{ id: groupId, memberStationIds: ["station:2023", "station:2024"] }],
    continuityCandidates: [],
    reconciledObservations: [canonical2024, conflict, canonical2021],
    osmMatchabilityProbe: {
      schemaVersion: 1,
      osmExtract: {
        artifactId: "osm:one",
        sha256: "abc",
        osmBaseTimestamp: "2026-08-29T10:00:00Z",
      },
      results: [
        {
          stationId: "station:2024",
          classification: "ambiguous",
          searchRadiusMeters: 75,
          selected: null,
          runnerUpGap: 0.02,
          candidates: [],
          rejectedCandidates: [],
        },
      ],
    },
    issues: [],
  };
  const streets: StreetSubject[] = [
    {
      id: "ign-street:avenue-de-verdun:1",
      displayName: "Avenue de Verdun",
      normalizedName: "avenue de verdun",
      segmentIds: ["1"],
      geometry: { type: "MultiLineString", coordinates: [[[-1.56, 43.48], [-1.55, 43.48]]] },
      vehicleAccess: ["free"],
      evidenceState: "data-available",
    },
    {
      id: "ign-street:avenue-de-la-gare:2",
      displayName: "Avenue de la Gare",
      normalizedName: "avenue de la gare",
      segmentIds: ["2"],
      geometry: { type: "MultiLineString", coordinates: [[[-1.55, 43.47], [-1.54, 43.47]]] },
      vehicleAccess: ["free"],
      evidenceState: "candidate-review",
    },
  ];
  const targets: TargetCorridor[] = [
    { targetId: "avenue-de-verdun", streetSubjectIds: [streets[0]!.id], displayName: "Avenue de Verdun", reviewStatus: "pending" },
    { targetId: "avenue-de-la-gare", streetSubjectIds: [streets[1]!.id], displayName: "Avenue de la Gare", reviewStatus: "pending" },
  ];
  return {
    audit,
    streets,
    targets,
    ignArtifact: {
      id: "ign:one",
      sourceUrl: "https://data.geopf.fr/wfs/ows",
      typeName: "BDTOPO_V3:troncon_de_route",
      acquiredAt: "2026-08-30T10:11:12Z",
      sha256: "ign-checksum",
      byteSize: 100,
      crs: "EPSG:4326",
      parserVersion: "1",
      bounds: { west: -1.58, south: 43.46, east: -1.52, north: 43.51 },
      license: {
        code: "lov2",
        url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
        redistributionAllowed: true,
        verifiedAt: "2026-08-30",
      },
      schemaVersion: 1,
    },
  };
}

describe("visualization bundle builder", () => {
  test("builds deterministic, evidence-limited display data", () => {
    const input = fixture();
    const first = buildVisualizationBundle({ ...input, assignments: [] });
    const second = buildVisualizationBundle({
      ...input,
      audit: {
        ...input.audit,
        sources: [...input.audit.sources].reverse(),
        evidence: [...input.audit.evidence].reverse(),
        inScopeStations: [...input.audit.inScopeStations].reverse(),
        reconciledObservations: [...input.audit.reconciledObservations].reverse(),
      },
      streets: [...input.streets].reverse(),
      targets: [...input.targets].reverse(),
      assignments: [],
    });

    expect(serializeVisualizationBundle(first)).toBe(
      serializeVisualizationBundle(second),
    );
    expect(serializeVisualizationBundle(first)).not.toContain("acquiredAt");
    expect(first.stationGroups[0]?.location.coordinates).toEqual([-1.55, 43.49]);
    expect(first.stationGroups[0]?.memberStationIds).toEqual([
      "station:2023",
      "station:2024",
    ]);
    expect(first.stationGroups[0]?.observations.map(({ year }) => year)).toEqual([
      2021,
      2024,
    ]);
    expect(first.stationGroups[0]?.issues).toContainEqual(
      expect.objectContaining({ code: "unresolved-observation-conflict" }),
    );
    expect(first.streetSubjects.every(({ evidenceState }) => evidenceState === "no-data")).toBe(true);
    expect(first.targetCorridors.map(({ targetId }) => targetId)).toEqual([
      "avenue-de-la-gare",
      "avenue-de-verdun",
    ]);
    expect(first.streetAssignments).toEqual([]);
  });

  test("clips linear display geometry to the buffer and retains record identity", () => {
    const input = fixture();
    const bundle = buildVisualizationBundle({ ...input, assignments: [] });
    expect(bundle.linearRecords[0]?.id).toBe("linear:2023:one");
    const coordinates = bundle.linearRecords[0]?.geometry.coordinates;
    expect(JSON.stringify(coordinates)).not.toContain("-1.58");
    expect(JSON.stringify(coordinates)).not.toContain("-1.52");
  });
});
