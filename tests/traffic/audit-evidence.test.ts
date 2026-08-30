import { describe, expect, test } from "vitest";

import type {
  ContinuityCandidate,
  GeographicEvidence,
  GeographicTrafficStation,
  SourceAuditStatus,
} from "../../src/traffic/contracts.js";
import {
  TrafficAuditEvidenceCollector,
  type AuditEvidenceDependencies,
} from "../../src/traffic/audit-evidence.js";
import { buildStationGroups } from "../../src/traffic/station-groups.js";

function station(id: string): GeographicTrafficStation {
  return {
    kind: "station",
    id,
    sourceId: "dreal-2024-point",
    sourceRecordId: `record:${id}`,
    counterType: "permanent",
    location: { type: "Point", coordinates: [-1.55, 43.48] },
    geographicScope: "inside-municipality",
  };
}

function candidate(
  leftStationId: string,
  rightStationId: string,
  classification: ContinuityCandidate["classification"],
): ContinuityCandidate {
  return {
    leftStationId,
    rightStationId,
    classification,
    score:
      classification === "probable" ? 0.9 : classification === "review" ? 0.7 : 0.4,
    distanceMeters: 10,
    evidence: {},
  };
}

describe("audit evidence", () => {
  test("groups only probable continuity and keeps deterministic source station IDs", () => {
    const stations = [station("station:buffer:2"), station("station:2024:86"), station("station:2023:86")];
    const candidates = [
      candidate("station:2023:86", "station:2024:86", "probable"),
      candidate("station:buffer:2", "station:2024:86", "review"),
    ];

    expect(buildStationGroups(stations, candidates)).toEqual([
      {
        id: "station-group:station:2023:86|station:2024:86",
        memberStationIds: ["station:2023:86", "station:2024:86"],
      },
      {
        id: "station-group:station:buffer:2",
        memberStationIds: ["station:buffer:2"],
      },
    ]);
    expect(
      buildStationGroups([...stations].reverse(), [...candidates].reverse()),
    ).toEqual(buildStationGroups(stations, candidates));
  });

  test("rejects a continuity candidate outside the supplied station scope", () => {
    expect(() =>
      buildStationGroups(
        [station("station:inside")],
        [candidate("station:inside", "station:outside", "probable")],
      ),
    ).toThrow("Unknown continuity station: station:outside");
  });

  test("collects one deterministic in-scope evidence snapshot while retaining outside source evidence", async () => {
    const sources: SourceAuditStatus[] = [
      {
        sourceId: "dreal-2019-2023-point",
        status: "audited",
        artifactId: "point-2023:checksum",
      },
      {
        sourceId: "dreal-2024-point",
        status: "audited",
        artifactId: "point-2024:checksum",
      },
    ];
    const evidence: GeographicEvidence[] = [
      {
        ...station("station:2023:86"),
        sourceId: "dreal-2019-2023-point",
        sourceStationId: "64-D810-12+520",
        roadRef: "D810",
      },
      {
        id: "observation:2021",
        sourceRecordId: "record:2021",
        stationId: "station:2023:86",
        year: 2021,
        periodType: "annual",
        vehiclesPerDay: 30_000,
        heavyVehiclePercent: 3,
        quality: "measured",
        sourceId: "dreal-2019-2023-point",
        geographicScope: "inside-municipality",
      },
      {
        ...station("station:2024:86"),
        sourceStationId: "64-D810-12+520",
        roadRef: "D810",
        location: { type: "Point", coordinates: [-1.55, 43.4801] },
      },
      {
        id: "observation:2024",
        sourceRecordId: "record:2024",
        stationId: "station:2024:86",
        year: 2024,
        periodType: "annual",
        vehiclesPerDay: 32_000,
        heavyVehiclePercent: 3.2,
        quality: "measured",
        sourceId: "dreal-2024-point",
        geographicScope: "inside-municipality",
      },
      {
        ...station("station:outside"),
        geographicScope: "outside",
        location: { type: "Point", coordinates: [-1.7, 43.6] },
      },
      {
        id: "observation:outside",
        sourceRecordId: "record:outside",
        stationId: "station:outside",
        year: 2024,
        periodType: "annual",
        vehiclesPerDay: 1_000,
        heavyVehiclePercent: null,
        quality: "measured",
        sourceId: "dreal-2024-point",
        geographicScope: "outside",
      },
    ];
    const boundary = {
      type: "MultiPolygon" as const,
      coordinates: [
        [
          [
            [-1.56, 43.47],
            [-1.54, 43.47],
            [-1.54, 43.49],
            [-1.56, 43.49],
            [-1.56, 43.47],
          ],
        ],
      ],
    };
    const dependencies: AuditEvidenceDependencies = {
      loadBoundary: async () => structuredClone(boundary),
      loadSources: async () => ({ sources, evidence, issues: [] }),
      loadOsmRoads: async () => ({
        artifactId: "osm:checksum",
        sha256: "checksum",
        osmBaseTimestamp: "2026-08-29T14:56:01Z",
        roads: [
          {
            osmWayId: "1",
            geometry: {
              type: "LineString",
              coordinates: [
                [-1.55, 43.479],
                [-1.55, 43.481],
              ],
            },
            highwayClass: "primary",
            roadRefs: ["D810"],
          },
        ],
      }),
    };

    const snapshot = await new TrafficAuditEvidenceCollector(
      dependencies,
    ).collect({
      asOf: "2026-08-29",
      cacheDirectory: "/tmp/busy-streets-audit-cache",
      outputDirectory: "/tmp/busy-streets-audit-output",
      boundaryInseeCode: "64122",
      bufferKilometers: 2,
    });

    expect(snapshot.evidence).toHaveLength(6);
    expect(snapshot.inScopeStations.map((value) => value.id)).toEqual([
      "station:2023:86",
      "station:2024:86",
    ]);
    expect(snapshot.stationGroups).toEqual([
      {
        id: "station-group:station:2023:86|station:2024:86",
        memberStationIds: ["station:2023:86", "station:2024:86"],
      },
    ]);
    expect(snapshot.continuityCandidates).toHaveLength(1);
    expect(snapshot.reconciledObservations).toHaveLength(2);
    expect(snapshot.osmMatchabilityProbe?.results).toHaveLength(2);
    expect(
      snapshot.reconciledObservations.some((value) =>
        value.subjectId.includes("outside"),
      ),
    ).toBe(false);
  });
});
