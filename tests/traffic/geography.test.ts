import { describe, expect, test } from "vitest";
import type { LineString } from "geojson";

import {
  classifyLineGeographicCoverage,
  classifyPointGeographicScope,
  createBiarritzGeographicFrame,
  geographicFrameBoundingBox,
  isIngressCandidate,
  parseBiarritzBoundary,
} from "../../src/traffic/geography.js";

const boundaryFeature = {
  type: "Feature",
  properties: {
    code: "64122",
    nom: "Biarritz",
  },
  geometry: {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [0, 0],
          [0.01, 0],
          [0.01, 0.01],
          [0, 0.01],
          [0, 0],
        ],
      ],
    ],
  },
} as const;

describe("Biarritz geography", () => {
  test("parses the official municipality feature without changing its geometry", () => {
    expect(parseBiarritzBoundary(boundaryFeature)).toEqual(
      boundaryFeature.geometry,
    );
  });

  test("rejects a boundary carrying another municipality code", () => {
    expect(() =>
      parseBiarritzBoundary({
        ...boundaryFeature,
        properties: { code: "64102", nom: "Bayonne" },
      }),
    ).toThrow();
  });

  test("produces byte-identical buffer geometry for identical input", () => {
    const boundary = parseBiarritzBoundary(boundaryFeature);
    const first = createBiarritzGeographicFrame(boundary);
    const second = createBiarritzGeographicFrame(boundary);

    expect(JSON.stringify(second.buffer)).toBe(JSON.stringify(first.buffer));
  });

  test("derives the WGS 84 extent from the separate buffer geometry", () => {
    const boundary = parseBiarritzBoundary(boundaryFeature);

    expect(
      geographicFrameBoundingBox({
        inseeCode: "64122",
        boundary,
        bufferKilometers: 2,
        buffer: {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [-0.02, -0.01],
                [0.03, -0.01],
                [0.03, 0.04],
                [-0.02, 0.04],
                [-0.02, -0.01],
              ],
            ],
          ],
        },
      }),
    ).toEqual({ west: -0.02, south: -0.01, east: 0.03, north: 0.04 });
  });

  test.each([
    { point: [0.005, 0.005], expected: "inside-municipality" },
    { point: [0, 0.005], expected: "inside-municipality" },
    { point: [-0.005, 0.005], expected: "buffer-only" },
    { point: [-0.05, 0.005], expected: "outside" },
  ] as const)("classifies $point as $expected", ({ point, expected }) => {
    const frame = createBiarritzGeographicFrame(
      parseBiarritzBoundary(boundaryFeature),
    );

    expect(
      classifyPointGeographicScope(
        { type: "Point", coordinates: [...point] },
        frame,
      ),
    ).toBe(expected);
  });

  test("measures only the part of a line inside Biarritz", () => {
    const frame = createBiarritzGeographicFrame(
      parseBiarritzBoundary(boundaryFeature),
    );

    expect(
      classifyLineGeographicCoverage(
        {
          type: "LineString",
          coordinates: [
            [-0.005, 0.005],
            [0.015, 0.005],
          ],
        },
        frame,
      ),
    ).toEqual({
      municipalityIntersects: true,
      bufferIntersects: true,
      lengthInsideMunicipalityKilometers: expect.closeTo(1.11195, 3),
    });
  });

  test("distinguishes a buffer-only line from an outside line", () => {
    const frame = createBiarritzGeographicFrame(
      parseBiarritzBoundary(boundaryFeature),
    );

    expect(
      classifyLineGeographicCoverage(
        {
          type: "LineString",
          coordinates: [
            [-0.005, -0.005],
            [-0.001, -0.005],
          ],
        },
        frame,
      ),
    ).toEqual({
      municipalityIntersects: false,
      bufferIntersects: true,
      lengthInsideMunicipalityKilometers: 0,
    });

    expect(
      classifyLineGeographicCoverage(
        {
          type: "LineString",
          coordinates: [
            [-0.05, -0.05],
            [-0.04, -0.05],
          ],
        },
        frame,
      ),
    ).toEqual({
      municipalityIntersects: false,
      bufferIntersects: false,
      lengthInsideMunicipalityKilometers: 0,
    });
  });

  test("sums municipality length across a MultiLineString", () => {
    const frame = createBiarritzGeographicFrame(
      parseBiarritzBoundary(boundaryFeature),
    );
    const coverage = classifyLineGeographicCoverage(
      {
        type: "MultiLineString",
        coordinates: [
          [
            [-0.005, 0.003],
            [0.015, 0.003],
          ],
          [
            [-0.005, 0.007],
            [0.015, 0.007],
          ],
        ],
      },
      frame,
    );

    expect(coverage.municipalityIntersects).toBe(true);
    expect(coverage.bufferIntersects).toBe(true);
    expect(coverage.lengthInsideMunicipalityKilometers).toBeCloseTo(2.2239, 3);
  });

  test("does not count the part of a line crossing a polygon hole", () => {
    const boundary = parseBiarritzBoundary({
      ...boundaryFeature,
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            boundaryFeature.geometry.coordinates[0]![0]!,
            [
              [0.004, 0.004],
              [0.006, 0.004],
              [0.006, 0.006],
              [0.004, 0.006],
              [0.004, 0.004],
            ],
          ],
        ],
      },
    });
    const coverage = classifyLineGeographicCoverage(
      {
        type: "LineString",
        coordinates: [
          [-0.005, 0.005],
          [0.015, 0.005],
        ],
      },
      createBiarritzGeographicFrame(boundary),
    );

    expect(coverage.lengthInsideMunicipalityKilometers).toBeCloseTo(0.88956, 3);
  });

  test("requires both buffer-only scope and a corridor crossing the boundary for ingress", () => {
    const frame = createBiarritzGeographicFrame(
      parseBiarritzBoundary(boundaryFeature),
    );
    const crossingCorridor: LineString = {
      type: "LineString",
      coordinates: [
        [-0.005, 0.005],
        [0.015, 0.005],
      ],
    };
    const bufferOnlyCorridor: LineString = {
      type: "LineString",
      coordinates: [
        [-0.005, -0.005],
        [-0.001, -0.005],
      ],
    };
    const whollyInsideCorridor: LineString = {
      type: "LineString",
      coordinates: [
        [0.002, 0.005],
        [0.008, 0.005],
      ],
    };
    const endpointTouchingCorridor: LineString = {
      type: "LineString",
      coordinates: [
        [-0.005, 0.005],
        [0, 0.005],
      ],
    };
    const boundaryCoincidentCorridor: LineString = {
      type: "LineString",
      coordinates: [
        [0, 0.002],
        [0, 0.008],
      ],
    };
    const outsideBoundaryOutsideCorridor: LineString = {
      type: "LineString",
      coordinates: [
        [-0.005, 0],
        [0, 0],
        [0, 0.01],
        [-0.005, 0.01],
      ],
    };

    expect(isIngressCandidate("buffer-only", crossingCorridor, frame)).toBe(
      true,
    );
    expect(isIngressCandidate("buffer-only", bufferOnlyCorridor, frame)).toBe(
      false,
    );
    expect(
      isIngressCandidate("buffer-only", whollyInsideCorridor, frame),
    ).toBe(false);
    expect(
      isIngressCandidate("buffer-only", endpointTouchingCorridor, frame),
    ).toBe(false);
    expect(
      isIngressCandidate("buffer-only", boundaryCoincidentCorridor, frame),
    ).toBe(false);
    expect(
      isIngressCandidate(
        "buffer-only",
        outsideBoundaryOutsideCorridor,
        frame,
      ),
    ).toBe(false);
    expect(
      isIngressCandidate("inside-municipality", crossingCorridor, frame),
    ).toBe(false);
  });
});
