import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { SourceArtifact } from "../../src/traffic/contracts.js";
import {
  enrichInspectionWithWfsSchema,
  inspectArtifact,
} from "../../src/traffic/inspection.js";
import { pointShapefileZip } from "./fixture-builders.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "busy-streets-inspection-"));
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

function artifact(overrides: Partial<SourceArtifact> = {}): SourceArtifact {
  return {
    id: "dreal-2024-point:fixture",
    sourceId: "dreal-2024-point",
    sourceUrl: "https://example.test/traffic.geojson",
    originalFilename: "traffic.geojson",
    acquiredAt: "2026-08-29T13:00:00.000Z",
    sha256: "fixture",
    byteSize: 1,
    crs: "EPSG:4326",
    adapterVersion: "1",
    license: {
      code: "not-specified",
      label: "Licence not specified",
      url: null,
      redistributionAllowed: false,
      verifiedAt: "2026-08-29",
    },
    ...overrides,
  };
}

describe("source inspection", () => {
  test("inspects GeoJSON fields without treating missing values as zero", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.geojson");
    await writeFile(
      localPath,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              route: "D 810",
              tmja: 1234,
              note: null,
              active: true,
            },
            geometry: { type: "Point", coordinates: [-1.55, 43.48] },
          },
          {
            type: "Feature",
            properties: {
              route: "D 810",
              tmja: null,
              active: false,
              extra: "x",
            },
            geometry: { type: "Point", coordinates: [-1.54, 43.49] },
          },
        ],
      }),
    );

    await expect(
      inspectArtifact({ artifact: artifact(), localPath }),
    ).resolves.toEqual({
      sourceId: "dreal-2024-point",
      artifactId: "dreal-2024-point:fixture",
      geometryTypes: ["Point"],
      crs: "EPSG:4326",
      encoding: "utf-8",
      recordCount: 2,
      fields: [
        {
          name: "active",
          inferredTypes: ["boolean"],
          nullCount: 0,
          sampleValues: [true, false],
        },
        {
          name: "extra",
          inferredTypes: ["string"],
          nullCount: 1,
          sampleValues: ["x"],
        },
        {
          name: "note",
          inferredTypes: [],
          nullCount: 2,
          sampleValues: [],
        },
        {
          name: "route",
          inferredTypes: ["string"],
          nullCount: 0,
          sampleValues: ["D 810"],
        },
        {
          name: "tmja",
          inferredTypes: ["number"],
          nullCount: 1,
          sampleValues: [1234],
        },
      ],
      issues: [],
    });
  });

  test("rejects GeoJSON without CRS evidence", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.geojson");
    await writeFile(
      localPath,
      JSON.stringify({ type: "FeatureCollection", features: [] }),
    );

    await expect(
      inspectArtifact({
        artifact: artifact({ crs: null }),
        localPath,
      }),
    ).rejects.toThrow(
      "Cannot inspect dreal-2024-point:fixture without CRS evidence",
    );
  });

  test("rejects a malformed ZIP archive", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    await writeFile(localPath, new Uint8Array([1, 2, 3, 4]));

    await expect(
      inspectArtifact({
        artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
        localPath,
      }),
    ).rejects.toThrow("Malformed ZIP artifact dreal-2024-point:fixture");
  });

  test("streams a complete zipped Shapefile with CRS and encoding evidence", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    await writeFile(
      localPath,
      pointShapefileZip([
        { x: -1.55, y: 43.48, route: "D 810", tmja: 1200 },
        { x: -1.54, y: 43.49, route: "D 810", tmja: 1300 },
      ]),
    );

    await expect(
      inspectArtifact({
        artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
        localPath,
      }),
    ).resolves.toEqual({
      sourceId: "dreal-2024-point",
      artifactId: "dreal-2024-point:fixture",
      geometryTypes: ["Point"],
      crs: "EPSG:4326",
      encoding: "utf-8",
      recordCount: 2,
      fields: [
        {
          name: "route",
          inferredTypes: ["string"],
          nullCount: 0,
          sampleValues: ["D 810"],
        },
        {
          name: "tmja",
          inferredTypes: ["number"],
          nullCount: 0,
          sampleValues: [1200, 1300],
        },
      ],
      issues: [],
    });
  });

  test("rejects a Shapefile bundle without CRS evidence", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    await writeFile(
      localPath,
      pointShapefileZip(
        [{ x: -1.55, y: 43.48, route: "D 810", tmja: 1200 }],
        { includeProjection: false },
      ),
    );

    await expect(
      inspectArtifact({
        artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
        localPath,
      }),
    ).rejects.toThrow(
      "ZIP artifact dreal-2024-point:fixture has no CRS evidence",
    );
  });

  test("rejects a Shapefile bundle without its SHX index", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    await writeFile(
      localPath,
      pointShapefileZip(
        [{ x: -1.55, y: 43.48, route: "D 810", tmja: 1200 }],
        { includeIndex: false },
      ),
    );

    await expect(
      inspectArtifact({
        artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
        localPath,
      }),
    ).rejects.toThrow(
      "ZIP artifact dreal-2024-point:fixture has no SHX index",
    );
  });

  test("rejects a corrupt SHX index", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    await writeFile(
      localPath,
      pointShapefileZip(
        [{ x: -1.55, y: 43.48, route: "D 810", tmja: 1200 }],
        { indexBytes: new Uint8Array() },
      ),
    );

    await expect(
      inspectArtifact({
        artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
        localPath,
      }),
    ).rejects.toThrow(
      "ZIP artifact dreal-2024-point:fixture has an invalid SHX index",
    );
  });

  test("rejects corrupt SHX record offsets", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    await writeFile(
      localPath,
      pointShapefileZip(
        [{ x: -1.55, y: 43.48, route: "D 810", tmja: 1200 }],
        { zeroIndexEntries: true },
      ),
    );

    await expect(
      inspectArtifact({
        artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
        localPath,
      }),
    ).rejects.toThrow(
      "ZIP artifact dreal-2024-point:fixture has an invalid SHX index",
    );
  });

  test("rejects mismatched Shapefile and DBF record counts", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    await writeFile(
      localPath,
      pointShapefileZip(
        [
          { x: -1.55, y: 43.48, route: "D 810", tmja: 1200 },
          { x: -1.54, y: 43.49, route: "D 810", tmja: 1300 },
        ],
        {
          attributeRecords: [
            { x: -1.55, y: 43.48, route: "D 810", tmja: 1200 },
          ],
        },
      ),
    );

    await expect(
      inspectArtifact({
        artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
        localPath,
      }),
    ).rejects.toThrow(
      "ZIP artifact dreal-2024-point:fixture has mismatched component record counts",
    );
  });

  test("rejects a premature DBF end marker in declared records", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    await writeFile(
      localPath,
      pointShapefileZip(
        [{ x: -1.55, y: 43.48, route: "D 810", tmja: 1200 }],
        { prematureDbfEof: true },
      ),
    );

    await expect(
      inspectArtifact({
        artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
        localPath,
      }),
    ).rejects.toThrow(
      "ZIP artifact dreal-2024-point:fixture has an invalid DBF attributes file",
    );
  });

  test("rejects a Shapefile bundle without encoding evidence", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    await writeFile(
      localPath,
      pointShapefileZip(
        [{ x: -1.55, y: 43.48, route: "D 810", tmja: 1200 }],
        { includeEncoding: false },
      ),
    );

    await expect(
      inspectArtifact({
        artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
        localPath,
      }),
    ).rejects.toThrow(
      "ZIP artifact dreal-2024-point:fixture has no encoding evidence; provide an encoding override",
    );
  });

  test("uses an explicit encoding override when a Shapefile has no CPG", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    await writeFile(
      localPath,
      pointShapefileZip(
        [{ x: -1.55, y: 43.48, route: "D 810", tmja: 1200 }],
        { includeEncoding: false },
      ),
    );

    const inspection = await inspectArtifact({
      artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
      localPath,
      encoding: "utf-8",
    });

    expect(inspection.encoding).toBe("utf-8");
    expect(inspection.recordCount).toBe(1);
  });

  test("prefers an explicit encoding override to a CPG declaration", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    await writeFile(
      localPath,
      pointShapefileZip(
        [{ x: -1.55, y: 43.48, route: "D 810", tmja: 1200 }],
        { encodingDeclaration: "unsupported-encoding" },
      ),
    );

    const inspection = await inspectArtifact({
      artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
      localPath,
      encoding: "utf-8",
    });

    expect(inspection.encoding).toBe("utf-8");
  });

  test("does not misclassify a projected WGS 84 CRS as geographic WGS 84", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    const projection =
      'PROJCS["WGS 84 / UTM zone 30N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-3],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1],AUTHORITY["EPSG","32630"]]';
    await writeFile(
      localPath,
      pointShapefileZip(
        [{ x: 620000, y: 4815000, route: "D 810", tmja: 1200 }],
        { projection },
      ),
    );

    const inspection = await inspectArtifact({
      artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
      localPath,
    });

    expect(inspection.crs).toBe("EPSG:32630");
  });

  test("uses the root authority for an RGF93 conic conformal zone", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    const projection =
      'PROJCS["RGF93 / CC42",GEOGCS["RGF93",DATUM["Reseau_Geodesique_Francais_1993",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic_2SP"],PARAMETER["standard_parallel_1",41.25],PARAMETER["standard_parallel_2",42.75],PARAMETER["latitude_of_origin",42],PARAMETER["central_meridian",3],PARAMETER["false_easting",1700000],PARAMETER["false_northing",1200000],UNIT["metre",1],AUTHORITY["EPSG","3942"]]';
    await writeFile(
      localPath,
      pointShapefileZip(
        [{ x: 1700000, y: 1200000, route: "D 810", tmja: 1200 }],
        { projection },
      ),
    );

    const inspection = await inspectArtifact({
      artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
      localPath,
    });

    expect(inspection.crs).toBe("EPSG:3942");
  });

  test("does not confuse TOWGS84 metadata with a WGS 84 root CRS", async () => {
    const directory = await temporaryDirectory();
    const localPath = join(directory, "traffic.zip");
    const projection =
      'GEOGCS["NTF (Paris)",DATUM["Nouvelle_Triangulation_Francaise_Paris",SPHEROID["Clarke 1880 (IGN)",6378249.2,293.4660212936269],TOWGS84[-168,-60,320,0,0,0,0]],PRIMEM["Paris",2.33722917],UNIT["grad",0.01570796326794897],AUTHORITY["EPSG","4807"]]';
    await writeFile(
      localPath,
      pointShapefileZip(
        [{ x: -1, y: 54, route: "D 810", tmja: 1200 }],
        { projection },
      ),
    );

    const inspection = await inspectArtifact({
      artifact: artifact({ originalFilename: "traffic.zip", crs: null }),
      localPath,
    });

    expect(inspection.crs).toBe("EPSG:4807");
  });

  test("adds WFS-declared fields omitted from every sampled feature", async () => {
    const directory = await temporaryDirectory();
    const dataPath = join(directory, "traffic.geojson");
    const schemaPath = join(directory, "traffic.xsd");
    await writeFile(
      dataPath,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { route: "D 810" },
            geometry: { type: "Point", coordinates: [-1.55, 43.48] },
          },
        ],
      }),
    );
    await writeFile(
      schemaPath,
      `<?xml version="1.0"?>
      <schema xmlns="http://www.w3.org/2001/XMLSchema" xmlns:gml="http://www.opengis.net/gml/3.2">
        <complexType name="trafficType"><complexContent><extension><sequence>
          <element name="msGeometry" type="gml:GeometryPropertyType"/>
          <element name="route" type="string" minOccurs="0"/>
          <element name="tmja_2020" type="integer" minOccurs="0"/>
          <element name="pc_pl_2020" type="double" minOccurs="0"/>
        </sequence></extension></complexContent></complexType>
      </schema>`,
    );
    const inspection = await inspectArtifact({
      artifact: artifact(),
      localPath: dataPath,
    });

    await expect(
      enrichInspectionWithWfsSchema(inspection, {
        artifact: artifact({
          id: "dreal-2024-point:schema-fixture",
          originalFilename: "traffic.xsd",
          crs: null,
        }),
        localPath: schemaPath,
      }),
    ).resolves.toMatchObject({
      schemaArtifactId: "dreal-2024-point:schema-fixture",
      fields: [
        {
          name: "pc_pl_2020",
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
          name: "tmja_2020",
          inferredTypes: ["number"],
          nullCount: 1,
          sampleValues: [],
        },
      ],
    });
  });

  test("rejects a WFS schema response without field declarations", async () => {
    const directory = await temporaryDirectory();
    const dataPath = join(directory, "traffic.geojson");
    const schemaPath = join(directory, "traffic.xsd");
    await writeFile(
      dataPath,
      JSON.stringify({ type: "FeatureCollection", features: [] }),
    );
    await writeFile(
      schemaPath,
      '<ExceptionReport><Exception exceptionCode="InvalidParameterValue"/></ExceptionReport>',
    );
    const inspection = await inspectArtifact({
      artifact: artifact(),
      localPath: dataPath,
    });

    await expect(
      enrichInspectionWithWfsSchema(inspection, {
        artifact: artifact({
          id: "dreal-2024-point:schema-fixture",
          originalFilename: "traffic.xsd",
          crs: null,
        }),
        localPath: schemaPath,
      }),
    ).rejects.toThrow(
      "WFS schema dreal-2024-point:schema-fixture has no field declarations",
    );
  });
});
