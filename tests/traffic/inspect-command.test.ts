import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runTrafficCli } from "../../scripts/traffic/cli.js";
import { pointShapefileZip } from "./fixture-builders.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "busy-streets-command-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("traffic inspect command", () => {
  test("downloads and inspects a stable non-WFS GeoJSON resource", async () => {
    const cacheDirectory = await temporaryDirectory();
    const outputDirectory = await temporaryDirectory();
    const geojson = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            annee: "2022",
            voie: "RD 810",
            code_insee: "64122",
            mja: 35_551,
            mjappl: 2.66,
            id: "86",
          },
          geometry: {
            type: "Point",
            coordinates: [-1.5434754896, 43.4642264044],
          },
        },
      ],
    });

    const exitCode = await runTrafficCli(
      [
        "inspect",
        "--source",
        "cd64-latest-road-counts-point",
        "--cache-dir",
        cacheDirectory,
        "--output-dir",
        outputDirectory,
      ],
      {
        fetch: async () =>
          new Response(geojson, {
            headers: { "content-type": "application/geo+json" },
          }),
        now: () => "2026-08-29T17:00:00.000Z",
        stdout: () => undefined,
        stderr: () => undefined,
      },
    );

    const inspection = JSON.parse(
      await readFile(
        join(
          outputDirectory,
          "cd64-latest-road-counts-point.inspection.json",
        ),
        "utf8",
      ),
    );
    expect(exitCode).toBe(0);
    expect(inspection).toMatchObject({
      sourceId: "cd64-latest-road-counts-point",
      crs: "EPSG:4326",
      encoding: "utf-8",
      recordCount: 1,
      geometryTypes: ["Point"],
    });
    expect(inspection).not.toHaveProperty("schemaArtifactId");
  });

  test("writes byte-identical WFS inspections across acquisition times", async () => {
    const cacheDirectory = await temporaryDirectory();
    const outputDirectory = await temporaryDirectory();
    const sample = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { route: "D 810", tmja_2024: 14000 },
          geometry: { type: "Point", coordinates: [-1.55, 43.48] },
        },
      ],
    });
    const schema = `
      <schema xmlns="http://www.w3.org/2001/XMLSchema" xmlns:gml="http://www.opengis.net/gml/3.2">
        <complexType name="trafficType"><complexContent><extension><sequence>
          <element name="msGeometry" type="gml:GeometryPropertyType"/>
          <element name="route" type="string"/>
          <element name="tmja_2024" type="integer"/>
          <element name="pc_pl_2024" type="double"/>
        </sequence></extension></complexContent></complexType>
      </schema>`;
    const fetch = async (input: string | URL | Request) =>
      String(input).includes("DescribeFeatureType")
        ? new Response(schema, { headers: { "content-type": "text/xml" } })
        : new Response(sample, {
            headers: { "content-type": "application/json" },
          });
    const output: string[] = [];
    const errors: string[] = [];
    const args = [
      "inspect",
      "--source",
      "dreal-2024-point",
      "--cache-dir",
      cacheDirectory,
      "--output-dir",
      outputDirectory,
      "--sample-size",
      "10",
    ];

    const firstExit = await runTrafficCli(args, {
      fetch,
      now: () => "2026-08-29T13:00:00.000Z",
      stdout: (message) => output.push(message),
      stderr: (message) => errors.push(message),
    });
    const outputPath = join(
      outputDirectory,
      "dreal-2024-point.inspection.json",
    );
    const firstBytes = await readFile(outputPath);

    const secondExit = await runTrafficCli(args, {
      fetch,
      now: () => "2026-08-30T13:00:00.000Z",
      stdout: (message) => output.push(message),
      stderr: (message) => errors.push(message),
    });
    const secondBytes = await readFile(outputPath);

    expect(firstExit).toBe(0);
    expect(secondExit).toBe(0);
    expect(secondBytes).toEqual(firstBytes);
    expect(JSON.parse(firstBytes.toString("utf8"))).toMatchObject({
      sourceId: "dreal-2024-point",
      schemaArtifactId: expect.stringContaining("dreal-2024-point:"),
      crs: "EPSG:4326",
      encoding: "utf-8",
      recordCount: 1,
      geometryTypes: ["Point"],
      fields: [
        {
          name: "pc_pl_2024",
          inferredTypes: ["number"],
          nullCount: 1,
          sampleValues: [],
        },
        {
          name: "route",
          inferredTypes: ["string"],
          nullCount: 0,
          sampleValues: ["D 810"],
        },
        {
          name: "tmja_2024",
          inferredTypes: ["number"],
          nullCount: 0,
          sampleValues: [14000],
        },
      ],
    });
    expect(firstBytes.toString("utf8")).not.toContain("acquiredAt");
    expect(errors).toEqual([]);
  });

  test("registers and inspects a manual Shapefile ZIP without a network call", async () => {
    const cacheDirectory = await temporaryDirectory();
    const outputDirectory = await temporaryDirectory();
    const suppliedDirectory = await temporaryDirectory();
    const suppliedPath = join(suppliedDirectory, "traffic-2011-2015.zip");
    await writeFile(
      suppliedPath,
      pointShapefileZip([
        { x: -1.55, y: 43.48, route: "D 810", tmja: 1100 },
      ]),
    );
    const errors: string[] = [];

    const exitCode = await runTrafficCli(
      [
        "inspect",
        "--source",
        "dreal-2011-2015-point",
        "--artifact",
        suppliedPath,
        "--cache-dir",
        cacheDirectory,
        "--output-dir",
        outputDirectory,
      ],
      {
        fetch: async () => {
          throw new Error("manual inspection must not fetch");
        },
        now: () => "2026-08-29T13:00:00.000Z",
        stdout: () => undefined,
        stderr: (message) => errors.push(message),
      },
    );

    const inspection = JSON.parse(
      await readFile(
        join(outputDirectory, "dreal-2011-2015-point.inspection.json"),
        "utf8",
      ),
    );
    expect(exitCode).toBe(0);
    expect(inspection).toMatchObject({
      sourceId: "dreal-2011-2015-point",
      crs: "EPSG:4326",
      encoding: "utf-8",
      recordCount: 1,
      geometryTypes: ["Point"],
    });
    expect(errors).toEqual([]);
  });

  test("accepts an explicit encoding for a manual Shapefile without CPG evidence", async () => {
    const cacheDirectory = await temporaryDirectory();
    const outputDirectory = await temporaryDirectory();
    const suppliedDirectory = await temporaryDirectory();
    const suppliedPath = join(suppliedDirectory, "traffic-2011-2015.zip");
    await writeFile(
      suppliedPath,
      pointShapefileZip(
        [{ x: -1.55, y: 43.48, route: "D 810", tmja: 1100 }],
        { includeEncoding: false },
      ),
    );
    const errors: string[] = [];

    const exitCode = await runTrafficCli(
      [
        "inspect",
        "--source",
        "dreal-2011-2015-point",
        "--artifact",
        suppliedPath,
        "--encoding",
        "utf-8",
        "--cache-dir",
        cacheDirectory,
        "--output-dir",
        outputDirectory,
      ],
      {
        fetch: async () => {
          throw new Error("manual inspection must not fetch");
        },
        now: () => "2026-08-29T13:00:00.000Z",
        stdout: () => undefined,
        stderr: (message) => errors.push(message),
      },
    );

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
  });
});
