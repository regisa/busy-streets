import { describe, expect, test } from "vitest";

import type {
  AuditIssue,
  GeographicEvidence,
  SourceAuditStatus,
} from "../../src/traffic/contracts.js";
import {
  buildAuditSummary,
  serializeAuditSummary,
} from "../../src/traffic/audit-summary.js";
import type { BuildAuditSummaryInput } from "../../src/traffic/audit-summary.js";

const boundary = {
  type: "MultiPolygon" as const,
  coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]],
};

const sources: SourceAuditStatus[] = [
  {
    sourceId: "dreal-2024-linear",
    status: "blocked",
    blockedReason: "Adapter not implemented",
  },
  {
    sourceId: "cd64-latest-road-counts-point",
    status: "audited",
    artifactId: "cd64:artifact",
  },
];

const evidence: GeographicEvidence[] = [
  {
    id: "cd64:record:0:observation:2022",
    sourceRecordId: "cd64:record:0",
    stationId: "cd64:station:86",
    year: 2022,
    periodType: "annual",
    vehiclesPerDay: 35_551,
    heavyVehiclePercent: 2.66,
    quality: "measured",
    sourceId: "cd64-latest-road-counts-point",
    geographicScope: "inside-municipality",
  },
  {
    kind: "station",
    id: "cd64:station:86",
    sourceId: "cd64-latest-road-counts-point",
    sourceRecordId: "cd64:record:0",
    sourceStationId: "86",
    counterType: "unknown",
    location: { type: "Point", coordinates: [0.5, 0.5] },
    roadRef: "D810",
    geographicScope: "inside-municipality",
  },
];

const issues: AuditIssue[] = [
  { code: "z-last", severity: "warning", message: "Last" },
  { code: "a-first", severity: "info", message: "First" },
];

const duplicateCases: readonly [
  string,
  Partial<BuildAuditSummaryInput>,
  string,
][] = [
  [
    "source IDs",
    {
      sources: [sources[0]!, { ...sources[0]!, status: "audited" }],
    },
    "Audit source IDs must be unique",
  ],
  [
    "evidence IDs",
    { evidence: [evidence[0]!, { ...evidence[0]! }] },
    "Geographic evidence IDs must be unique",
  ],
  [
    "reconciliation keys",
    {
      reconciledObservations: [
        {
          subjectId: "station:86",
          year: 2022,
          periodType: "annual",
          variants: [],
          resolution: "canonical",
          canonical: null,
          comparisonValue: null,
        },
        {
          subjectId: "station:86",
          year: 2022,
          periodType: "annual",
          variants: [],
          resolution: "canonical",
          canonical: null,
          comparisonValue: null,
        },
      ],
    },
    "Reconciled subject-year keys must be unique",
  ],
  [
    "continuity pairs",
    {
      continuityCandidates: [
        {
          leftStationId: "a",
          rightStationId: "b",
          score: 0.9,
          classification: "probable",
          distanceMeters: 10,
          evidence: {},
        },
        {
          leftStationId: "b",
          rightStationId: "a",
          score: 0.9,
          classification: "probable",
          distanceMeters: 10,
          evidence: {},
        },
      ],
    },
    "Continuity station pairs must be unique",
  ],
  [
    "OSM station IDs",
    {
      osmMatchabilityProbe: {
        schemaVersion: 1,
        osmExtract: {
          artifactId: "osm:artifact",
          sha256: "checksum",
          osmBaseTimestamp: "2026-08-29T14:56:01Z",
        },
        results: [
          {
            stationId: "station:86",
            classification: "unmatched",
            searchRadiusMeters: 200,
            selected: null,
            runnerUpGap: null,
            candidates: [],
            rejectedCandidates: [],
          },
          {
            stationId: "station:86",
            classification: "unmatched",
            searchRadiusMeters: 200,
            selected: null,
            runnerUpGap: null,
            candidates: [],
            rejectedCandidates: [],
          },
        ],
      },
    },
    "OSM matchability station IDs must be unique",
  ],
];

describe("audit summary", () => {
  test("derives deterministic counts and years from retained evidence", () => {
    const summary = buildAuditSummary({
      asOf: "2026-08-29",
      boundary,
      sources,
      evidence,
      reconciledObservations: [
        {
          subjectId: "station:86",
          year: 2022,
          periodType: "annual",
          variants: [],
          resolution: "unresolved-conflict",
          canonical: null,
          comparisonValue: null,
        },
      ],
      continuityCandidates: [
        {
          leftStationId: "a",
          rightStationId: "b",
          score: 0.9,
          classification: "probable",
          distanceMeters: 10,
          evidence: {},
        },
      ],
      osmMatchabilityProbe: {
        schemaVersion: 1,
        osmExtract: {
          artifactId: "osm:artifact",
          sha256: "checksum",
          osmBaseTimestamp: "2026-08-29T14:56:01Z",
        },
        results: [
          {
            stationId: "cd64:station:86",
            classification: "ambiguous",
            searchRadiusMeters: 75,
            selected: null,
            runnerUpGap: null,
            candidates: [],
            rejectedCandidates: [],
          },
        ],
      },
      issues,
      recommendation: "limited-corridor-or-station-explorer",
    });

    expect(summary.years).toEqual([2022]);
    expect(summary.qualityCounts).toEqual({
      measured: 1,
      modeled: 0,
      interpolated: 0,
      unknown: 0,
    });
    expect(summary.counts).toEqual({
      continuityProbable: 1,
      continuityReview: 0,
      continuitySeparate: 0,
      observations: 1,
      osmAmbiguous: 1,
      osmPlausible: 0,
      osmUnmatched: 0,
      reconciliationCanonical: 0,
      reconciliationUnresolvedConflicts: 1,
      stations: 1,
      stationsBufferOnly: 0,
      stationsInsideMunicipality: 1,
      stationsOutside: 0,
    });
    expect(summary.sources.map((source) => source.sourceId)).toEqual([
      "cd64-latest-road-counts-point",
      "dreal-2024-linear",
    ]);
    expect(summary.issues.map((issue) => issue.code)).toEqual([
      "a-first",
      "z-last",
    ]);
  });

  test("serializes byte-identically when collection input order changes", () => {
    const shared = {
      asOf: "2026-08-29",
      boundary,
      reconciledObservations: [],
      continuityCandidates: [],
      osmMatchabilityProbe: null,
      recommendation: "insufficient-open-data" as const,
    };
    const first = buildAuditSummary({
      ...shared,
      sources,
      evidence,
      issues,
    });
    const second = buildAuditSummary({
      ...shared,
      sources: [...sources].reverse(),
      evidence: [...evidence].reverse(),
      issues: [...issues].reverse(),
    });

    expect(serializeAuditSummary(second)).toBe(serializeAuditSummary(first));
    expect(serializeAuditSummary(first).endsWith("\n")).toBe(true);
  });

  test.each(duplicateCases)("rejects duplicate %s before deriving counts", (_label, override, message) => {
    expect(() =>
      buildAuditSummary({
        asOf: "2026-08-29",
        boundary,
        sources: [],
        evidence: [],
        reconciledObservations: [],
        continuityCandidates: [],
        osmMatchabilityProbe: null,
        issues: [],
        recommendation: "insufficient-open-data",
        ...override,
      }),
    ).toThrow(message);
  });
});
