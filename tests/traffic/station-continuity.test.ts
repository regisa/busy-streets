import { describe, expect, test } from "vitest";

import type { TrafficStation } from "../../src/traffic/contracts.js";
import {
  findStationContinuityCandidates,
  scoreStationContinuity,
} from "../../src/traffic/station-continuity.js";

function station(
  id: string,
  overrides: Partial<TrafficStation> = {},
): TrafficStation {
  return {
    kind: "station",
    id,
    sourceId: id.split(":")[0] ?? id,
    sourceRecordId: `${id}:record`,
    sourceStationId: "64-D810-10+200",
    counterType: "permanent",
    location: { type: "Point", coordinates: [-1.558, 43.483] },
    roadRef: "D810",
    ...overrides,
  };
}

function withoutRoadRef(value: TrafficStation): TrafficStation {
  const { roadRef: _omitted, ...stationWithoutRoadRef } = value;
  return stationWithoutRoadRef;
}

describe("station continuity", () => {
  test("classifies matching external ID, road reference, proximity, and counter type as probable", () => {
    const result = scoreStationContinuity(
      station("source-a:station:1"),
      station("source-b:station:9"),
    );

    expect(result).toEqual({
      leftStationId: "source-a:station:1",
      rightStationId: "source-b:station:9",
      score: 0.9,
      classification: "probable",
      distanceMeters: 0,
      evidence: {
        externalIdExact: true,
        roadRefExact: true,
        withinDistance: true,
        normalizedNameExact: false,
        counterTypeExact: true,
      },
    });
  });

  test("classifies the exact 0.65 threshold as review", () => {
    const result = scoreStationContinuity(
      withoutRoadRef(station("source-a:station:1")),
      withoutRoadRef(station("source-b:station:9")),
    );

    expect(result).toMatchObject({
      score: 0.65,
      classification: "review",
    });
  });

  test("matches road names after case, accent, and punctuation normalization", () => {
    const result = scoreStationContinuity(
      withoutRoadRef(station("source-a:station:1", {
        sourceStationId: "left-id",
        roadName: "Avenue de la Libération",
      })),
      withoutRoadRef(station("source-b:station:9", {
        sourceStationId: "right-id",
        roadName: "avenue-de-la-liberation",
      })),
    );

    expect(result).toMatchObject({
      score: 0.35,
      classification: "separate",
      evidence: { normalizedNameExact: true },
    });
  });

  test("hard-rejects contradictory known road references", () => {
    const result = scoreStationContinuity(
      station("source-a:station:1", { roadRef: "D810" }),
      station("source-b:station:9", { roadRef: "D260" }),
    );

    expect(result).toMatchObject({
      score: 0,
      classification: "separate",
      rejectedReason: "contradictory-road-reference",
      evidence: {
        roadRefExact: false,
        roadRefConflict: true,
      },
    });
  });

  test("does not create a candidate beyond 150 metres", () => {
    const result = scoreStationContinuity(
      station("source-a:station:1"),
      station("source-b:station:9", {
        location: { type: "Point", coordinates: [-1.548, 43.483] },
      }),
    );

    expect(result).toBeNull();
  });

  test("finds each nearby pair once in deterministic station-ID order", () => {
    const stations = [
      station("source-c:station:3", {
        location: { type: "Point", coordinates: [-1.548, 43.483] },
      }),
      station("source-b:station:2"),
      station("source-a:station:1"),
    ] as const;

    const result = findStationContinuityCandidates(stations);
    const reversed = findStationContinuityCandidates([...stations].reverse());

    expect(result).toEqual(reversed);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      leftStationId: "source-a:station:1",
      rightStationId: "source-b:station:2",
    });
  });

  test("rejects duplicate station IDs instead of scoring a station against itself", () => {
    expect(() =>
      findStationContinuityCandidates([
        station("source-a:station:1"),
        station("source-a:station:1", {
          sourceRecordId: "source-a:record:duplicate",
        }),
      ]),
    ).toThrow("Station IDs must be unique before continuity scoring");
  });

  test("treats unknown counter types as missing evidence", () => {
    const result = scoreStationContinuity(
      withoutRoadRef(
        station("source-a:station:1", {
          sourceStationId: "left-id",
          counterType: "unknown",
        }),
      ),
      withoutRoadRef(
        station("source-b:station:9", {
          sourceStationId: "right-id",
          counterType: "unknown",
        }),
      ),
    );

    expect(result).toMatchObject({
      score: 0.2,
      evidence: { counterTypeExact: false },
    });
  });

  test("rejects a direct attempt to score one station ID against itself", () => {
    expect(() =>
      scoreStationContinuity(
        station("source-a:station:1"),
        station("source-a:station:1", {
          sourceRecordId: "source-a:record:duplicate",
        }),
      ),
    ).toThrow("Continuity scoring requires two distinct station IDs");
  });

  test("returns the same ordered candidate when direct arguments are reversed", () => {
    const left = station("source-a:station:1");
    const right = station("source-b:station:9");

    expect(scoreStationContinuity(right, left)).toEqual(
      scoreStationContinuity(left, right),
    );
  });

  test("ignores apostrophes without introducing a word boundary", () => {
    const result = scoreStationContinuity(
      withoutRoadRef(
        station("source-a:station:1", {
          counterType: "unknown",
          roadName: "Route d'Arcangues",
        }),
      ),
      withoutRoadRef(
        station("source-b:station:9", {
          counterType: "unknown",
          roadName: "Route dArcangues",
        }),
      ),
    );

    expect(result).toMatchObject({
      score: 0.7,
      classification: "review",
      evidence: { normalizedNameExact: true },
    });
  });
});
