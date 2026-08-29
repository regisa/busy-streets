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
});
