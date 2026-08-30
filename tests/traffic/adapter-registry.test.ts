import { describe, expect, test } from "vitest";

import { Dreal2024PointAdapter } from "../../src/traffic/adapters/dreal-2024-point.js";
import { Dreal2019To2023PointAdapter } from "../../src/traffic/adapters/dreal-2019-2023-point.js";
import { Dreal2023LinearAdapter } from "../../src/traffic/adapters/dreal-2023-linear.js";
import { createTrafficSourceAdapter } from "../../src/traffic/adapters/registry.js";

describe("traffic source adapter registry", () => {
  test("selects only implemented source adapters", () => {
    const resolvePath = async () => "/not-used";

    expect(
      createTrafficSourceAdapter("dreal-2024-point", resolvePath),
    ).toBeInstanceOf(Dreal2024PointAdapter);
    expect(
      createTrafficSourceAdapter("dreal-2019-2023-point", resolvePath),
    ).toBeInstanceOf(Dreal2019To2023PointAdapter);
    expect(
      createTrafficSourceAdapter("dreal-2023-linear", resolvePath),
    ).toBeInstanceOf(Dreal2023LinearAdapter);
    expect(
      createTrafficSourceAdapter("dreal-2024-linear", resolvePath),
    ).toBeNull();
    expect(
      createTrafficSourceAdapter("cd64-latest-road-counts-point", resolvePath),
    ).not.toBeNull();
    expect(createTrafficSourceAdapter("unknown", resolvePath)).toBeNull();
  });
});
