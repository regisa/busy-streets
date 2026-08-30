import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { Wgs84BoundingBox } from "../../src/traffic/contracts.js";
import {
  acquireIgnRoads,
  buildIgnRoadPageUrl,
} from "../../src/traffic/ign-roads.js";

const temporaryDirectories: string[] = [];

const bounds: Wgs84BoundingBox = {
  west: -1.59,
  south: 43.43,
  east: -1.51,
  north: 43.51,
};

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "busy-streets-ign-"));
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

function feature(
  id: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    type: "Feature",
    id: `troncon_de_route.${id}`,
    geometry: {
      type: "LineString",
      coordinates: [
        [-1.56, 43.48, 12.4],
        [-1.55, 43.49, 12.8],
      ],
    },
    properties: {
      cleabs: id,
      nature: "Route à 1 chaussée",
      acces_vehicule_leger: "Libre",
      nom_voie_ban_gauche: "Avenue de Verdun",
      nom_voie_ban_droite: " Avenue de Verdun ",
      alias_gauche: "Av. de Verdun",
      insee_commune_gauche: "64122",
      insee_commune_droite: "64122",
      ...overrides,
    },
  };
}

function page(
  features: readonly unknown[],
  numberMatched: number,
  crs = "urn:ogc:def:crs:EPSG::4326",
): string {
  return JSON.stringify({
    type: "FeatureCollection",
    features,
    numberMatched,
    numberReturned: features.length,
    crs: { type: "name", properties: { name: crs } },
  });
}

describe("IGN road acquisition", () => {
  test("builds the current BD TOPO road request with WFS 2 axis order", () => {
    const url = new URL(buildIgnRoadPageUrl(bounds, 0, 1000));

    expect(url.origin + url.pathname).toBe("https://data.geopf.fr/wfs/ows");
    expect(url.searchParams.get("TYPENAMES")).toBe(
      "BDTOPO_V3:troncon_de_route",
    );
    expect(url.searchParams.get("BBOX")).toBe(
      "43.43,-1.59,43.51,-1.51,urn:ogc:def:crs:EPSG::4326",
    );
    expect(url.searchParams.get("OUTPUTFORMAT")).toBe("application/json");
    expect(url.searchParams.get("STARTINDEX")).toBe("0");
    expect(url.searchParams.get("COUNT")).toBe("1000");
  });

  test("acquires every page and stores deterministic normalized roads with provenance", async () => {
    const cacheDirectory = await temporaryDirectory();
    const requestedUrls: string[] = [];
    const responses = [
      page(
        [
          feature("TRON-2", {
            nom_voie_ban_gauche: "Avenue de la Gare",
            nom_voie_ban_droite: null,
            alias_gauche: null,
            acces_vehicule_leger: "Restreint",
          }),
          feature("TRON-1"),
        ],
        3,
      ),
      page(
        [
          feature("TRON-3", {
            nom_voie_ban_gauche: null,
            nom_voie_ban_droite: null,
            alias_gauche: null,
            cpx_toponyme_route_nommee: "D 810",
            acces_vehicule_leger: "Interdit",
            insee_commune_droite: "64100",
          }),
        ],
        3,
      ),
    ];

    const result = await acquireIgnRoads({
      bounds,
      cacheDirectory,
      pageSize: 2,
      fetch: async (input) => {
        requestedUrls.push(String(input));
        const body = responses.shift();
        if (!body) throw new Error("unexpected IGN request");
        return new Response(body, {
          headers: { "content-type": "application/geo+json" },
        });
      },
      now: () => "2026-08-30T10:00:00.000Z",
    });

    expect(requestedUrls.map((value) => new URL(value).searchParams.get("STARTINDEX"))).toEqual([
      "0",
      "2",
    ]);
    expect(result.segments.map((segment) => segment.id)).toEqual([
      "TRON-1",
      "TRON-2",
      "TRON-3",
    ]);
    expect(result.segments[0]).toEqual({
      id: "TRON-1",
      geometry: {
        type: "LineString",
        coordinates: [
          [-1.56, 43.48],
          [-1.55, 43.49],
        ],
      },
      names: ["Av. de Verdun", "Avenue de Verdun"],
      nature: "Route à 1 chaussée",
      vehicleAccess: "free",
      inseeCodes: ["64122"],
    });
    expect(result.segments[2]).toMatchObject({
      names: ["D 810"],
      vehicleAccess: "prohibited",
      inseeCodes: ["64100", "64122"],
    });
    const storedBytes = await readFile(result.localPath);
    expect(result.artifact).toMatchObject({
      acquiredAt: "2026-08-30T10:00:00.000Z",
      crs: "EPSG:4326",
      parserVersion: "1",
      bounds,
      license: {
        code: "lov2",
        redistributionAllowed: true,
        verifiedAt: "2026-08-30",
      },
      schemaVersion: 1,
    });
    expect(result.artifact.sha256).toBe(
      createHash("sha256").update(storedBytes).digest("hex"),
    );
    expect(JSON.parse(await readFile(result.provenancePath, "utf8"))).toEqual(
      result.artifact,
    );
  });

  test("rejects invalid HTTP, content, CRS, geometry, and pagination", async () => {
    const cacheDirectory = await temporaryDirectory();
    const acquire = (response: Response) =>
      acquireIgnRoads({
        bounds,
        cacheDirectory,
        fetch: async () => response,
      });

    await expect(acquire(new Response("busy", { status: 503 }))).rejects.toThrow(
      "503",
    );
    await expect(
      acquire(
        new Response("<!doctype html>", {
          headers: { "content-type": "text/html" },
        }),
      ),
    ).rejects.toThrow("HTML");
    await expect(
      acquire(
        new Response(page([], 0, "urn:ogc:def:crs:EPSG::2154"), {
          headers: { "content-type": "application/json" },
        }),
      ),
    ).rejects.toThrow("EPSG:4326");
    await expect(
      acquire(
        new Response(
          page(
            [
              {
                ...feature("TRON-BAD"),
                geometry: { type: "Point", coordinates: [-1.55, 43.48] },
              },
            ],
            1,
          ),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    ).rejects.toThrow("LineString");

    let request = 0;
    await expect(
      acquireIgnRoads({
        bounds,
        cacheDirectory,
        pageSize: 1,
        fetch: async () => {
          request += 1;
          return new Response(
            request === 1 ? page([feature("TRON-1")], 2) : page([], 2),
            { headers: { "content-type": "application/json" } },
          );
        },
      }),
    ).rejects.toThrow("ended before all matched roads were returned");
  });

  test("rejects duplicate segment IDs across pages", async () => {
    const cacheDirectory = await temporaryDirectory();
    let request = 0;

    await expect(
      acquireIgnRoads({
        bounds,
        cacheDirectory,
        pageSize: 1,
        fetch: async () => {
          request += 1;
          return new Response(page([feature("TRON-1")], 2), {
            headers: { "content-type": "application/json" },
          });
        },
      }),
    ).rejects.toThrow("Duplicate IGN road segment ID: TRON-1");
    expect(request).toBe(2);
  });
});
