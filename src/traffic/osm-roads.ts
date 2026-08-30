import type { LineString } from "geojson";
import { z } from "zod";

const motorRoadClasses = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "road",
]);

const overpassGeometryPositionSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
});

const overpassWaySchema = z.object({
  type: z.literal("way"),
  id: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
  tags: z.record(z.string(), z.string()),
  geometry: z.array(overpassGeometryPositionSchema),
});

const overpassResponseSchema = z.object({
  osm3s: z.object({
    timestamp_osm_base: z.string().datetime({ offset: true }),
    copyright: z.string().optional(),
  }),
  remark: z.string().optional(),
  elements: z.array(z.unknown()),
});

export interface OsmRoad {
  readonly osmWayId: string;
  readonly geometry: LineString;
  readonly highwayClass: string;
  readonly roadRefs: readonly string[];
  readonly roadName?: string;
}

export interface ParsedOverpassRoads {
  readonly osmBaseTimestamp: string;
  readonly attribution: string | null;
  readonly roads: readonly OsmRoad[];
}

export function normalizeOsmRoadRef(value: string): string | null {
  const normalized = value.replace(/[\s-]+/g, "").toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function parseOverpassRoads(value: unknown): ParsedOverpassRoads {
  if (
    typeof value !== "object" ||
    value === null ||
    !("osm3s" in value) ||
    typeof value.osm3s !== "object" ||
    value.osm3s === null ||
    !("timestamp_osm_base" in value.osm3s)
  ) {
    throw new Error("Overpass response is missing osm3s.timestamp_osm_base");
  }
  const response = overpassResponseSchema.parse(value);
  if (response.remark?.trim()) {
    throw new Error(`Overpass returned an incomplete response: ${response.remark}`);
  }
  const roads: OsmRoad[] = [];
  const seenWayIds = new Set<string>();

  for (const element of response.elements) {
    if (
      typeof element !== "object" ||
      element === null ||
      !("type" in element) ||
      element.type !== "way"
    ) {
      continue;
    }
    const way = overpassWaySchema.parse(element);
    const highwayClass = way.tags.highway;
    if (!highwayClass || !motorRoadClasses.has(highwayClass)) continue;
    if (way.geometry.length < 2) {
      throw new Error(`OSM way ${way.id} must contain at least two positions`);
    }
    if (
      !way.geometry.slice(1).some((position, index) => {
        const previous = way.geometry[index];
        return previous &&
          (position.lat !== previous.lat || position.lon !== previous.lon);
      })
    ) {
      throw new Error(`OSM way ${way.id} must contain a non-zero segment`);
    }
    const osmWayId = String(way.id);
    if (seenWayIds.has(osmWayId)) {
      throw new Error(`Duplicate OSM way ID: ${osmWayId}`);
    }
    seenWayIds.add(osmWayId);
    const roadRefs = (way.tags.ref ?? "")
      .split(";")
      .map(normalizeOsmRoadRef)
      .filter((roadRef): roadRef is string => roadRef !== null);
    roads.push({
      osmWayId,
      geometry: {
        type: "LineString",
        coordinates: way.geometry.map(({ lon, lat }) => [lon, lat]),
      },
      highwayClass,
      roadRefs: [...new Set(roadRefs)].sort(),
      ...(way.tags.name ? { roadName: way.tags.name } : {}),
    });
  }

  roads.sort((left, right) => compareOsmIds(left.osmWayId, right.osmWayId));
  return {
    osmBaseTimestamp: response.osm3s.timestamp_osm_base,
    attribution: response.osm3s.copyright ?? null,
    roads,
  };
}

function compareOsmIds(left: string, right: string): number {
  const leftNumeric = BigInt(left);
  const rightNumeric = BigInt(right);
  return leftNumeric < rightNumeric ? -1 : leftNumeric > rightNumeric ? 1 : 0;
}
