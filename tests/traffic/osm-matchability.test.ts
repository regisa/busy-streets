import { describe, expect, test } from "vitest";

import type { TrafficStation } from "../../src/traffic/contracts.js";
import type { OsmRoad } from "../../src/traffic/osm-roads.js";
import {
  assessRoadMatchability,
  createOsmMatchabilityProbe,
  scoreRoadMatchCandidate,
} from "../../src/traffic/osm-matchability.js";

function station(overrides: Partial<TrafficStation> = {}): TrafficStation {
  return {
    kind: "station",
    id: "source:station:1",
    sourceId: "source",
    sourceRecordId: "source:record:1",
    counterType: "permanent",
    location: { type: "Point", coordinates: [0, 0] },
    roadRef: "D810",
    roadName: "Avenue de la Libération",
    bearing: 90,
    ...overrides,
  };
}

function road(overrides: Partial<OsmRoad> = {}): OsmRoad {
  return {
    osmWayId: "10",
    geometry: {
      type: "LineString",
      coordinates: [
        [-0.001, 0],
        [0.001, 0],
      ],
    },
    highwayClass: "primary",
    roadRefs: ["D810"],
    roadName: "avenue-de-la-liberation",
    ...overrides,
  };
}

describe("OSM road matchability", () => {
  test("scores independent distance, reference, name, class, and axial-bearing evidence", () => {
    const result = scoreRoadMatchCandidate(station(), road());

    expect(result).toMatchObject({
      stationId: "source:station:1",
      osmWayId: "10",
      score: 1,
      distanceMeters: 0,
      evidence: {
        distanceScore: 0.4,
        roadRefExact: true,
        roadRefScore: 0.3,
        normalizedNameExact: true,
        roadNameScore: 0.15,
        roadClassCompatible: true,
        roadClassScore: 0.1,
        bearingDifferenceDegrees: 0,
        bearingScore: 0.05,
      },
    });

    const reverseDigitized = scoreRoadMatchCandidate(
      station(),
      road({
        geometry: {
          type: "LineString",
          coordinates: [
            [0.001, 0],
            [-0.001, 0],
          ],
        },
      }),
    );
    expect(reverseDigitized?.evidence).toMatchObject({
      bearingDifferenceDegrees: 0,
      bearingScore: 0.05,
    });
  });

  test("hard-rejects a candidate when both known road references contradict", () => {
    const result = scoreRoadMatchCandidate(
      station({ roadRef: "D810" }),
      road({ roadRefs: ["D260"] }),
    );

    expect(result).toMatchObject({
      score: 0,
      rejectedReason: "contradictory-road-reference",
      evidence: { roadRefConflict: true },
    });
  });

  test("uses 75 metres first and calls an unopposed qualifying match plausible", () => {
    const result = assessRoadMatchability(station(), [road()]);

    expect(result).toMatchObject({
      stationId: "source:station:1",
      classification: "plausible",
      searchRadiusMeters: 75,
      runnerUpGap: null,
      selected: { osmWayId: "10", score: 1 },
    });
    expect(result.candidates).toHaveLength(1);
  });

  test("expands to 200 metres only when the 75 metre search has no non-rejected candidate", () => {
    const fartherRoad = road({
      osmWayId: "20",
      geometry: {
        type: "LineString",
        coordinates: [
          [-0.001, 0.001],
          [0.001, 0.001],
        ],
      },
    });
    const result = assessRoadMatchability(station(), [fartherRoad]);

    expect(result.searchRadiusMeters).toBe(200);
    expect(result.classification).toBe("ambiguous");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.distanceMeters).toBeGreaterThan(100);
  });

  test("requires both the score threshold and a 0.15 runner-up lead", () => {
    const runnerUp = road({
      osmWayId: "20",
      roadName: "Different road",
    });
    const result = assessRoadMatchability(station(), [road(), runnerUp]);

    expect(result).toMatchObject({
      classification: "plausible",
      selected: { osmWayId: "10", score: 1 },
    });
    expect(result.runnerUpGap).toBeCloseTo(0.15, 12);
  });

  test("does not round a sub-threshold evidence total up to plausible", () => {
    const { roadName: _roadName, bearing: _bearing, ...limitedStation } =
      station();
    const slightlyOffsetRoad = road({
      roadName: "Different road",
      geometry: {
        type: "LineString",
        coordinates: [
          [-0.001, 0.000009],
          [0.001, 0.000009],
        ],
      },
    });
    const result = assessRoadMatchability(limitedStation, [slightlyOffsetRoad]);

    expect(result.selected?.score).toBeGreaterThan(0.79);
    expect(result.selected?.score).toBeLessThan(0.8);
    expect(result.classification).toBe("ambiguous");
  });

  test("includes a mathematically exact 0.80 score despite floating-point representation", () => {
    const { roadName: _roadName, bearing: _bearing, ...limitedStation } =
      station();
    const result = assessRoadMatchability(limitedStation, [
      road({ roadName: "Different road" }),
    ]);

    expect(result.selected?.score).toBe(0.7999999999999999);
    expect(result.classification).toBe("plausible");
  });

  test("does not round a sub-threshold runner-up gap up to 0.15", () => {
    const selected = road({
      osmWayId: "10",
      geometry: {
        type: "LineString",
        coordinates: [
          [-0.001, -0.000007854],
          [0.001, 0.000007854],
        ],
      },
    });
    const runnerUp = road({
      osmWayId: "20",
      roadName: "Different road",
    });
    const result = assessRoadMatchability(station(), [selected, runnerUp]);

    expect(result.selected?.osmWayId).toBe("10");
    expect(result.runnerUpGap).toBeGreaterThan(0.14);
    expect(result.runnerUpGap).toBeLessThan(0.15);
    expect(result.classification).toBe("ambiguous");
  });

  test("includes a mathematically exact 0.15 lead despite floating-point representation", () => {
    const result = assessRoadMatchability(station(), [
      road({
        osmWayId: "10",
        highwayClass: "residential",
        geometry: {
          type: "LineString",
          coordinates: [
            [0, -0.001],
            [0, 0.001],
          ],
        },
      }),
      road({ osmWayId: "20", roadRefs: [] }),
    ]);

    expect(result.runnerUpGap).toBeLessThan(0.15);
    expect(result.runnerUpGap).toBeCloseTo(0.15, 12);
    expect(result.classification).toBe("plausible");
  });

  test("does not expand when the initial radius contains only a rejected candidate", () => {
    const result = assessRoadMatchability(station(), [
      road({ osmWayId: "10", roadRefs: ["D260"] }),
      road({
        osmWayId: "20",
        geometry: {
          type: "LineString",
          coordinates: [
            [-0.001, 0.001],
            [0.001, 0.001],
          ],
        },
      }),
    ]);

    expect(result).toMatchObject({
      classification: "unmatched",
      searchRadiusMeters: 75,
      candidates: [],
    });
    expect(result.rejectedCandidates.map((candidate) => candidate.osmWayId)).toEqual([
      "10",
    ]);
  });

  test("classifies close scores as ambiguous and orders ties deterministically", () => {
    const result = assessRoadMatchability(station(), [
      road({ osmWayId: "20" }),
      road({ osmWayId: "10" }),
    ]);

    expect(result).toMatchObject({
      classification: "ambiguous",
      runnerUpGap: 0,
      selected: { osmWayId: "10" },
    });
    expect(result.candidates.map((candidate) => candidate.osmWayId)).toEqual([
      "10",
      "20",
    ]);
  });

  test("reports unmatched when only contradictory or distant roads exist", () => {
    const result = assessRoadMatchability(station(), [
      road({ roadRefs: ["D260"] }),
      road({
        osmWayId: "30",
        geometry: {
          type: "LineString",
          coordinates: [
            [-0.001, 0.01],
            [0.001, 0.01],
          ],
        },
      }),
    ]);

    expect(result).toMatchObject({
      classification: "unmatched",
      searchRadiusMeters: 75,
      selected: null,
      candidates: [],
    });
    expect(result.rejectedCandidates).toHaveLength(1);
  });

  test("gives missing evidence zero instead of inferring it", () => {
    const {
      roadRef: _stationRoadRef,
      roadName: _stationRoadName,
      bearing: _stationBearing,
      ...stationWithoutOptionalEvidence
    } = station();
    const {
      roadName: _roadName,
      ...roadWithoutOptionalName
    } = road({ roadRefs: [] });
    const result = scoreRoadMatchCandidate(
      stationWithoutOptionalEvidence,
      roadWithoutOptionalName,
    );

    expect(result).toMatchObject({
      score: 0.4,
      evidence: {
        distanceScore: 0.4,
        roadRefExact: false,
        roadRefScore: 0,
        normalizedNameExact: false,
        roadNameScore: 0,
        roadClassCompatible: false,
        roadClassScore: 0,
        bearingScore: 0,
      },
    });
    expect(result.evidence).not.toHaveProperty("bearingDifferenceDegrees");
  });

  test("ties the ordered station results to the exact OSM snapshot", () => {
    const probe = createOsmMatchabilityProbe(
      {
        artifactId: "osm-roads:abc",
        sha256: "abc",
        osmBaseTimestamp: "2026-08-29T10:00:00Z",
      },
      [station({ id: "station:b" }), station({ id: "station:a" })],
      [road()],
    );

    expect(probe).toMatchObject({
      schemaVersion: 1,
      osmExtract: {
        artifactId: "osm-roads:abc",
        sha256: "abc",
        osmBaseTimestamp: "2026-08-29T10:00:00Z",
      },
    });
    expect(probe.results.map((result) => result.stationId)).toEqual([
      "station:a",
      "station:b",
    ]);
  });
});
