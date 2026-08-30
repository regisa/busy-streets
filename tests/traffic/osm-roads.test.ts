import { describe, expect, test } from "vitest";

import { parseOverpassRoads } from "../../src/traffic/osm-roads.js";

describe("Overpass road parsing", () => {
  test("retains deterministic motor-road evidence and ignores non-road ways", () => {
    const parsed = parseOverpassRoads({
      version: 0.6,
      generator: "Overpass API",
      osm3s: {
        timestamp_osm_base: "2026-08-29T10:00:00Z",
        copyright: "The data included in this document is from www.openstreetmap.org.",
      },
      elements: [
        {
          type: "way",
          id: 20,
          tags: { highway: "footway", name: "Promenade" },
          geometry: [
            { lat: 43.48, lon: -1.56 },
            { lat: 43.481, lon: -1.559 },
          ],
        },
        {
          type: "way",
          id: 10,
          tags: {
            highway: "primary",
            ref: "D 810;D-910",
            name: "Avenue de la Libération",
          },
          geometry: [
            { lat: 43.48, lon: -1.56 },
            { lat: 43.481, lon: -1.559 },
          ],
        },
      ],
    });

    expect(parsed).toEqual({
      osmBaseTimestamp: "2026-08-29T10:00:00Z",
      attribution:
        "The data included in this document is from www.openstreetmap.org.",
      roads: [
        {
          osmWayId: "10",
          geometry: {
            type: "LineString",
            coordinates: [
              [-1.56, 43.48],
              [-1.559, 43.481],
            ],
          },
          highwayClass: "primary",
          roadRefs: ["D810", "D910"],
          roadName: "Avenue de la Libération",
        },
      ],
    });
  });

  test("rejects missing snapshots, duplicate way IDs, and invalid way geometry", () => {
    expect(() => parseOverpassRoads({ elements: [] })).toThrow(
      "timestamp_osm_base",
    );

    const base = {
      osm3s: { timestamp_osm_base: "2026-08-29T10:00:00Z" },
      elements: [
        {
          type: "way",
          id: 1,
          tags: { highway: "residential" },
          geometry: [
            { lat: 43.48, lon: -1.56 },
            { lat: 43.481, lon: -1.559 },
          ],
        },
      ],
    };

    expect(() =>
      parseOverpassRoads({ ...base, elements: [...base.elements, ...base.elements] }),
    ).toThrow("Duplicate OSM way ID");
    expect(() =>
      parseOverpassRoads({
        ...base,
        elements: [{ ...base.elements[0], geometry: [{ lat: 43.48, lon: -1.56 }] }],
      }),
    ).toThrow("at least two positions");
    expect(() =>
      parseOverpassRoads({
        ...base,
        elements: [
          {
            ...base.elements[0],
            geometry: [
              { lat: 43.48, lon: -1.56 },
              { lat: 43.48, lon: -1.56 },
            ],
          },
        ],
      }),
    ).toThrow("non-zero segment");
  });
});
