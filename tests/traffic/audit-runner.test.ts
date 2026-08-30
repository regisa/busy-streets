import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type {
  GeographicEvidence,
  SourceAuditStatus,
} from "../../src/traffic/contracts.js";
import {
  createDefaultAuditRunner,
  TrafficAuditRunner,
} from "../../src/traffic/audit-runner.js";
import {
  TrafficAuditEvidenceCollector,
  type AuditEvidenceDependencies,
} from "../../src/traffic/audit-evidence.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "busy-streets-audit-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

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

const sources: SourceAuditStatus[] = [
  {
    sourceId: "dreal-2024-linear",
    status: "blocked",
    blockedReason: "Adapter not implemented",
  },
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
    kind: "station",
    id: "station:2023:86",
    sourceId: "dreal-2019-2023-point",
    sourceRecordId: "record:2023:86",
    sourceStationId: "64-D810-12+520",
    counterType: "permanent",
    location: { type: "Point", coordinates: [-1.55, 43.48] },
    roadRef: "D810",
    roadName: "Route test",
    geographicScope: "inside-municipality",
  },
  {
    id: "observation:2023:86:2021",
    sourceRecordId: "record:2023:86",
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
    kind: "station",
    id: "station:2024:86",
    sourceId: "dreal-2024-point",
    sourceRecordId: "record:2024:86",
    sourceStationId: "64-D810-12+520",
    counterType: "permanent",
    location: { type: "Point", coordinates: [-1.55, 43.4801] },
    roadRef: "D810",
    roadName: "Route test",
    geographicScope: "inside-municipality",
  },
  {
    id: "observation:2024:86:2024",
    sourceRecordId: "record:2024:86",
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
    kind: "station",
    id: "station:outside:1",
    sourceId: "dreal-2024-point",
    sourceRecordId: "record:outside:1",
    counterType: "unknown",
    location: { type: "Point", coordinates: [-1.7, 43.6] },
    geographicScope: "outside",
  },
];

function dependencies(reverse: boolean): AuditEvidenceDependencies {
  return {
    loadBoundary: async () => structuredClone(boundary),
    loadSources: async () => ({
      sources: reverse ? [...sources].reverse() : sources,
      evidence: reverse ? [...evidence].reverse() : evidence,
      issues: [],
    }),
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
          roadName: "Route test",
        },
      ],
    }),
  };
}

function runner(reverse: boolean): TrafficAuditRunner {
  return new TrafficAuditRunner(
    new TrafficAuditEvidenceCollector(dependencies(reverse)),
  );
}

describe("traffic audit runner", () => {
  test("writes a deterministic summary from derived continuity, reconciliation, and OSM results", async () => {
    const firstOutputDirectory = await temporaryDirectory();
    const secondOutputDirectory = await temporaryDirectory();
    const config = {
      asOf: "2026-08-29",
      cacheDirectory: await temporaryDirectory(),
      outputDirectory: firstOutputDirectory,
      boundaryInseeCode: "64122" as const,
      bufferKilometers: 2 as const,
    };

    const first = await runner(false).run(config);
    const second = await runner(true).run({
      ...config,
      outputDirectory: secondOutputDirectory,
    });
    const firstBytes = await readFile(
      join(firstOutputDirectory, "audit-summary.json"),
      "utf8",
    );
    const secondBytes = await readFile(
      join(secondOutputDirectory, "audit-summary.json"),
      "utf8",
    );

    expect(first.counts).toMatchObject({
      continuityProbable: 1,
      reconciliationCanonical: 2,
      osmPlausible: 2,
      osmUnmatched: 0,
    });
    expect(first.recommendation).toBe("limited-corridor-or-station-explorer");
    expect(first.sources.map((source) => source.sourceId)).toEqual([
      "dreal-2019-2023-point",
      "dreal-2024-linear",
      "dreal-2024-point",
    ]);
    expect(second).toEqual(first);
    expect(secondBytes).toBe(firstBytes);
    expect(firstBytes).not.toContain("acquiredAt");
  });

  test("rejects an audit configuration outside the approved Biarritz frame", async () => {
    const auditRunner = runner(false);

    await expect(
      auditRunner.run({
        asOf: "2026-08-29",
        cacheDirectory: await temporaryDirectory(),
        outputDirectory: await temporaryDirectory(),
        boundaryInseeCode: "64122",
        bufferKilometers: 3 as 2,
      }),
    ).rejects.toThrow("2 km buffer");
  });

  test("audits every implemented machine-readable source and retains explicit blockers", async () => {
    const cacheDirectory = await temporaryDirectory();
    const outputDirectory = await temporaryDirectory();
    const pointFeature = (year: 2021 | 2024, value: number) => ({
      type: "Feature",
      properties: {
        id_comptag: "64-D810-12+520",
        type_poste: "permanent",
        route: "D810",
        [`tmja_${year}`]: value,
        [`pc_pl_${year}`]: 3,
      },
      geometry: { type: "Point", coordinates: [-1.55, 43.479] },
    });
    const featureCollection = (features: readonly unknown[]) =>
      JSON.stringify({ type: "FeatureCollection", features });
    const wfsSchema = `
      <schema xmlns="http://www.w3.org/2001/XMLSchema" xmlns:gml="http://www.opengis.net/gml/3.2">
        <complexType name="trafficType"><complexContent><extension><sequence>
          <element name="msGeometry" type="gml:GeometryPropertyType"/>
          <element name="id_comptag" type="string"/>
          <element name="type_poste" type="string"/>
          <element name="route" type="string"/>
          <element name="tmja_2021" type="double"/>
          <element name="pc_pl_2021" type="double"/>
          <element name="tmja_2024" type="double"/>
          <element name="pc_pl_2024" type="double"/>
          <element name="id_ign" type="string"/>
          <element name="millesime" type="string"/>
          <element name="long_km" type="double"/>
          <element name="veh_km" type="double"/>
          <element name="pc_pl" type="double"/>
          <element name="numero" type="string"/>
        </sequence></extension></complexContent></complexType>
      </schema>`;
    const fetch = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("geo.api.gouv.fr/communes/64122")) {
        return new Response(
          JSON.stringify({
            type: "Feature",
            properties: { code: "64122" },
            geometry: boundary,
          }),
          { headers: { "content-type": "application/geo+json" } },
        );
      }
      if (url.includes("overpass-api.de")) {
        return new Response(
          JSON.stringify({
            osm3s: { timestamp_osm_base: "2026-08-29T14:56:01Z" },
            elements: [
              {
                type: "way",
                id: 1,
                tags: { highway: "primary", ref: "D810" },
                geometry: [
                  { lon: -1.55, lat: 43.479 },
                  { lon: -1.55, lat: 43.481 },
                ],
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("DescribeFeatureType")) {
        return new Response(wfsSchema, {
          headers: { "content-type": "text/xml" },
        });
      }
      if (url.includes("5f0e7e36-dc34-4983-903a-e1a27f570d90")) {
        return new Response(featureCollection([pointFeature(2021, 30_000)]), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("c19722dc-3abf-4cb1-a539-eb3d759b202e")) {
        return new Response(featureCollection([pointFeature(2024, 32_000)]), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("comptages_routiers/exports/geojson")) {
        return new Response(
          featureCollection([
            {
              type: "Feature",
              properties: {
                id: "86",
                annee: "2022",
                voie: "RD 810",
                pr: "12+520",
                mja: 31_000,
                mjappl: 3,
              },
              geometry: { type: "Point", coordinates: [-1.55, 43.479] },
            },
          ]),
          { headers: { "content-type": "application/geo+json" } },
        );
      }
      throw new Error(`Unexpected audit request: ${url}`);
    };
    const runner = createDefaultAuditRunner({
      fetch,
      now: () => "2026-08-30T10:00:00.000Z",
    });

    const summary = await runner.run({
      asOf: "2026-08-29",
      cacheDirectory,
      outputDirectory,
      boundaryInseeCode: "64122",
      bufferKilometers: 2,
    });

    expect(summary.sources.filter((source) => source.status === "audited"))
      .toHaveLength(3);
    expect(summary.sources.filter((source) => source.status === "blocked"))
      .toHaveLength(3);
    expect(summary.counts).toMatchObject({
      stations: 3,
      observations: 3,
      reconciliationCanonical: 3,
      osmPlausible: 3,
    });
    expect(summary.recommendation).toBe("limited-corridor-or-station-explorer");
    expect(
      JSON.parse(await readFile(join(outputDirectory, "audit-summary.json"), "utf8")),
    ).toEqual(summary);
  });
});
