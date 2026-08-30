import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { LineString } from "geojson";

import type { Wgs84BoundingBox } from "./contracts.js";

export const IGN_ROADS_ENDPOINT = "https://data.geopf.fr/wfs/ows";
export const IGN_ROADS_TYPE_NAME = "BDTOPO_V3:troncon_de_route";

const OPEN_LICENCE_URL =
  "https://www.etalab.gouv.fr/licence-ouverte-open-licence/";

export interface IgnRoadSegment {
  readonly id: string;
  readonly geometry: LineString;
  readonly names: readonly string[];
  readonly nature: string | null;
  readonly vehicleAccess: "free" | "restricted" | "prohibited" | "unknown";
  readonly inseeCodes: readonly string[];
}

export interface IgnRoadArtifact {
  readonly id: string;
  readonly sourceUrl: typeof IGN_ROADS_ENDPOINT;
  readonly typeName: typeof IGN_ROADS_TYPE_NAME;
  readonly acquiredAt: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly crs: "EPSG:4326";
  readonly parserVersion: "1";
  readonly bounds: Wgs84BoundingBox;
  readonly license: {
    readonly code: "lov2";
    readonly url: typeof OPEN_LICENCE_URL;
    readonly redistributionAllowed: true;
    readonly verifiedAt: "2026-08-30";
  };
  readonly schemaVersion: 1;
}

export interface AcquireIgnRoadsOptions {
  readonly bounds: Wgs84BoundingBox;
  readonly cacheDirectory: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => string;
  readonly pageSize?: number;
}

export interface AcquiredIgnRoads {
  readonly artifact: IgnRoadArtifact;
  readonly segments: readonly IgnRoadSegment[];
  readonly localPath: string;
  readonly provenancePath: string;
}

export function buildIgnRoadPageUrl(
  bounds: Wgs84BoundingBox,
  startIndex: number,
  count: number,
): string {
  validateBounds(bounds);
  if (!Number.isInteger(startIndex) || startIndex < 0) {
    throw new Error("IGN WFS start index must be a non-negative integer");
  }
  if (!Number.isInteger(count) || count < 1 || count > 5000) {
    throw new Error("IGN WFS page size must be an integer from 1 through 5000");
  }
  const parameters = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: IGN_ROADS_TYPE_NAME,
    OUTPUTFORMAT: "application/json",
    SRSNAME: "EPSG:4326",
    BBOX: `${bounds.south},${bounds.west},${bounds.north},${bounds.east},urn:ogc:def:crs:EPSG::4326`,
    STARTINDEX: String(startIndex),
    COUNT: String(count),
  });
  return `${IGN_ROADS_ENDPOINT}?${parameters}`;
}

export async function acquireIgnRoads(
  options: AcquireIgnRoadsOptions,
): Promise<AcquiredIgnRoads> {
  const pageSize = options.pageSize ?? 1000;
  const fetchRoads = options.fetch ?? globalThis.fetch;
  const segments = new Map<string, IgnRoadSegment>();
  let expectedMatches: number | null = null;
  let startIndex = 0;

  while (expectedMatches === null || segments.size < expectedMatches) {
    const url = buildIgnRoadPageUrl(options.bounds, startIndex, pageSize);
    const response = await fetchRoads(url, {
      headers: {
        accept: "application/geo+json, application/json",
        "user-agent":
          "BusyStreetsLocalPrototype/0.1 (https://github.com/regisa/busy-streets)",
      },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to acquire IGN roads: HTTP ${response.status} ${response.statusText}`,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (responseIsHtml(response, bytes)) {
      throw new Error("IGN WFS returned HTML instead of road GeoJSON");
    }
    const parsed = parsePage(bytes);
    if (expectedMatches === null) {
      expectedMatches = parsed.numberMatched;
    } else if (parsed.numberMatched !== expectedMatches) {
      throw new Error("IGN WFS numberMatched changed during pagination");
    }
    if (parsed.features.length === 0 && segments.size < expectedMatches) {
      throw new Error("IGN WFS pagination ended before all matched roads were returned");
    }
    for (const feature of parsed.features) {
      const segment = parseSegment(feature);
      if (segments.has(segment.id)) {
        throw new Error(`Duplicate IGN road segment ID: ${segment.id}`);
      }
      segments.set(segment.id, segment);
    }
    startIndex += parsed.features.length;
  }

  if (segments.size !== expectedMatches) {
    throw new Error(
      `IGN WFS returned ${segments.size} distinct roads for ${expectedMatches} matches`,
    );
  }
  const sortedSegments = [...segments.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const storedValue = {
    type: "FeatureCollection",
    features: sortedSegments.map((segment) => ({
      type: "Feature",
      id: segment.id,
      geometry: segment.geometry,
      properties: {
        names: segment.names,
        nature: segment.nature,
        vehicleAccess: segment.vehicleAccess,
        inseeCodes: segment.inseeCodes,
      },
    })),
  } as const;
  const storedBytes = new TextEncoder().encode(
    `${JSON.stringify(storedValue, null, 2)}\n`,
  );
  const checksum = sha256(storedBytes);
  const acquiredAt = (options.now ?? (() => new Date().toISOString()))();
  const artifactDirectory = join(
    options.cacheDirectory,
    "ign-roads",
    checksum,
  );
  const localPath = join(artifactDirectory, "bdtopo-roads.geojson");
  await mkdir(artifactDirectory, { recursive: true });
  await storeVerifiedFile(localPath, storedBytes);
  const artifact: IgnRoadArtifact = {
    id: `ign-roads:${checksum}`,
    sourceUrl: IGN_ROADS_ENDPOINT,
    typeName: IGN_ROADS_TYPE_NAME,
    acquiredAt,
    sha256: checksum,
    byteSize: storedBytes.byteLength,
    crs: "EPSG:4326",
    parserVersion: "1",
    bounds: structuredClone(options.bounds),
    license: {
      code: "lov2",
      url: OPEN_LICENCE_URL,
      redistributionAllowed: true,
      verifiedAt: "2026-08-30",
    },
    schemaVersion: 1,
  };
  const provenancePath = join(
    artifactDirectory,
    `provenance-${sha256(new TextEncoder().encode(acquiredAt)).slice(0, 12)}.json`,
  );
  await storeVerifiedFile(
    provenancePath,
    new TextEncoder().encode(`${JSON.stringify(artifact, null, 2)}\n`),
  );
  return {
    artifact,
    segments: sortedSegments,
    localPath,
    provenancePath,
  };
}

interface IgnRoadPage {
  readonly features: readonly unknown[];
  readonly numberMatched: number;
}

function parsePage(bytes: Uint8Array): IgnRoadPage {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error("IGN WFS road response is not valid JSON", { cause: error });
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    value.type !== "FeatureCollection" ||
    !("features" in value) ||
    !Array.isArray(value.features) ||
    !("numberMatched" in value) ||
    typeof value.numberMatched !== "number" ||
    !Number.isInteger(value.numberMatched) ||
    value.numberMatched < 0
  ) {
    throw new Error("IGN WFS road response is not a valid FeatureCollection");
  }
  if (!("crs" in value) || !isEpsg4326Crs(value.crs)) {
    throw new Error("IGN WFS road response must declare EPSG:4326");
  }
  return { features: value.features, numberMatched: value.numberMatched };
}

function isEpsg4326Crs(value: unknown): boolean {
  if (typeof value !== "object" || value === null || !("properties" in value)) {
    return false;
  }
  const properties = value.properties;
  if (
    typeof properties !== "object" ||
    properties === null ||
    !("name" in properties) ||
    typeof properties.name !== "string"
  ) {
    return false;
  }
  return /(?:EPSG(?::|::)4326|CRS84)$/i.test(properties.name);
}

function parseSegment(value: unknown): IgnRoadSegment {
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    value.type !== "Feature" ||
    !("geometry" in value) ||
    !("properties" in value)
  ) {
    throw new Error("IGN road entry must be a GeoJSON Feature");
  }
  const properties = sourceProperties(value.properties);
  const propertyId = textProperty(properties, "cleabs");
  const featureId = "id" in value ? textValue(value.id) : null;
  const id = propertyId ?? featureId;
  if (!id) throw new Error("IGN road segment requires a stable ID");

  const geometry = lineGeometry(value.geometry);
  const nameFields = [
    "nom_voie_ban_gauche",
    "nom_voie_ban_droite",
    "nom_collaboratif_gauche",
    "nom_collaboratif_droite",
    "alias_gauche",
    "alias_droit",
    "cpx_toponyme_route_nommee",
  ] as const;
  const names = [...new Set(nameFields.flatMap((field) => {
    const name = textProperty(properties, field);
    return name ? [name] : [];
  }))].sort((left, right) => left.localeCompare(right, "fr"));
  const inseeCodes = [
    textProperty(properties, "insee_commune_gauche"),
    textProperty(properties, "insee_commune_droite"),
  ]
    .filter((value): value is string => value !== null)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left.localeCompare(right));

  return Object.freeze({
    id,
    geometry,
    names: Object.freeze(names),
    nature: textProperty(properties, "nature"),
    vehicleAccess: vehicleAccess(
      textProperty(properties, "acces_vehicule_leger"),
    ),
    inseeCodes: Object.freeze(inseeCodes),
  });
}

function sourceProperties(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("IGN road properties must be an object");
  }
  return value as Readonly<Record<string, unknown>>;
}

function textProperty(
  properties: Readonly<Record<string, unknown>>,
  name: string,
): string | null {
  return textValue(properties[name]);
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function lineGeometry(value: unknown): LineString {
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    value.type !== "LineString" ||
    !("coordinates" in value) ||
    !Array.isArray(value.coordinates) ||
    value.coordinates.length < 2
  ) {
    throw new Error("IGN road geometry must be a non-degenerate LineString");
  }
  const coordinates = value.coordinates.map((position) => {
    if (
      !Array.isArray(position) ||
      position.length < 2 ||
      typeof position[0] !== "number" ||
      !Number.isFinite(position[0]) ||
      typeof position[1] !== "number" ||
      !Number.isFinite(position[1])
    ) {
      throw new Error("IGN road LineString coordinates must be finite");
    }
    return [position[0], position[1]] as [number, number];
  });
  return {
    type: "LineString",
    coordinates,
  };
}

function vehicleAccess(
  value: string | null,
): IgnRoadSegment["vehicleAccess"] {
  const normalized = value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized === "libre") return "free";
  if (normalized === "restreint" || normalized === "restreinte") {
    return "restricted";
  }
  if (normalized === "interdit" || normalized === "interdite") {
    return "prohibited";
  }
  return "unknown";
}

function responseIsHtml(response: Response, bytes: Uint8Array): boolean {
  if (response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
    return true;
  }
  const prefix = new TextDecoder().decode(bytes.slice(0, 64)).trimStart();
  return /^<!doctype html|^<html/i.test(prefix);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function storeVerifiedFile(path: string, bytes: Uint8Array): Promise<void> {
  if (await fileExists(path)) {
    const existingBytes = new Uint8Array(await readFile(path));
    if (sha256(existingBytes) === sha256(bytes)) return;
  }
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function validateBounds(bounds: Wgs84BoundingBox): void {
  const values = [bounds.west, bounds.south, bounds.east, bounds.north];
  if (
    !values.every(Number.isFinite) ||
    bounds.west < -180 ||
    bounds.east > 180 ||
    bounds.south < -90 ||
    bounds.north > 90 ||
    bounds.west >= bounds.east ||
    bounds.south >= bounds.north
  ) {
    throw new Error("IGN WFS bounding box must be a valid WGS 84 extent");
  }
}
