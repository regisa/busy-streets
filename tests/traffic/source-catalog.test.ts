import { describe, expect, test } from "vitest";

import { DREAL_TRAFFIC_SOURCES } from "../../src/traffic/source-catalog.js";

describe("DREAL source catalogue", () => {
  test("contains the six approved point and linear datasets through 2024", () => {
    expect(DREAL_TRAFFIC_SOURCES.map((source) => source.id)).toEqual([
      "dreal-2011-2015-point",
      "dreal-2015-2019-point",
      "dreal-2019-2023-point",
      "dreal-2023-linear",
      "dreal-2024-point",
      "dreal-2024-linear",
    ]);
  });

  test("allows tracked samples only for sources with an explicit open licence", () => {
    expect(
      DREAL_TRAFFIC_SOURCES.map((source) => [
        source.id,
        source.license.redistributionAllowed,
      ]),
    ).toEqual([
      ["dreal-2011-2015-point", true],
      ["dreal-2015-2019-point", true],
      ["dreal-2019-2023-point", false],
      ["dreal-2023-linear", false],
      ["dreal-2024-point", false],
      ["dreal-2024-linear", false],
    ]);
  });

  test("exposes official WFS access only for the four recent sources", () => {
    expect(
      DREAL_TRAFFIC_SOURCES.map((source) => [
        source.id,
        "wfs" in source ? source.wfs : null,
      ]),
    ).toEqual([
      ["dreal-2011-2015-point", null],
      ["dreal-2015-2019-point", null],
      [
        "dreal-2019-2023-point",
        {
          endpoint:
            "https://datacarto.sigena.fr/wfs/5f0e7e36-dc34-4983-903a-e1a27f570d90",
          typeName: "ms:l_comptage_trafic_p_r75",
          version: "2.0.0",
          outputFormat: "application/json; subtype=geojson",
          outputCrs: "EPSG:4326",
        },
      ],
      [
        "dreal-2023-linear",
        {
          endpoint:
            "https://datacarto.sigena.fr/wfs/31e35ea7-c328-4411-ae8f-306ca536678a",
          typeName: "ms:l_tmja2023_l_r74",
          version: "2.0.0",
          outputFormat: "application/json; subtype=geojson",
          outputCrs: "EPSG:4326",
        },
      ],
      [
        "dreal-2024-point",
        {
          endpoint:
            "https://datacarto.sigena.fr/wfs/c19722dc-3abf-4cb1-a539-eb3d759b202e",
          typeName: "ms:l_tmja_2024_p_r75",
          version: "2.0.0",
          outputFormat: "application/json; subtype=geojson",
          outputCrs: "EPSG:4326",
        },
      ],
      [
        "dreal-2024-linear",
        {
          endpoint:
            "https://datacarto.sigena.fr/wfs/79905218-085a-441f-8492-3003eea64fef",
          typeName: "ms:l_tmja_2024_l_r75",
          version: "2.0.0",
          outputFormat: "application/json; subtype=geojson",
          outputCrs: "EPSG:4326",
        },
      ],
    ]);
  });
});
