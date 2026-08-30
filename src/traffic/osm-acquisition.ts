import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Wgs84BoundingBox } from "./contracts.js";
import { parseOverpassRoads } from "./osm-roads.js";

export const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
const ODBL_URL = "https://opendatacommons.org/licenses/odbl/1-0/";

export interface OsmRoadExtractArtifact {
  readonly id: string;
  readonly sourceUrl: typeof OVERPASS_ENDPOINT;
  readonly query: string;
  readonly acquiredAt: string;
  readonly osmBaseTimestamp: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly crs: "EPSG:4326";
  readonly parserVersion: "1";
  readonly bounds: Wgs84BoundingBox;
  readonly license: {
    readonly code: "odbl-1.0";
    readonly url: typeof ODBL_URL;
    readonly evidenceUrl: typeof OSM_COPYRIGHT_URL;
    readonly attribution: "OpenStreetMap contributors";
    readonly redistributionAllowed: true;
    readonly verifiedAt: "2026-08-29";
  };
  readonly schemaVersion: 1;
}

export interface OsmRoadAcquisitionOptions {
  readonly bounds: Wgs84BoundingBox;
  readonly cacheDirectory: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => string;
}

export interface AcquiredOsmRoadExtract {
  readonly artifact: OsmRoadExtractArtifact;
  readonly localPath: string;
  readonly provenancePath: string;
}

export function buildOverpassRoadQuery(bounds: Wgs84BoundingBox): string {
  validateBounds(bounds);
  return `[out:json][timeout:60];way["highway"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});out body geom;`;
}

export async function acquireOsmRoadExtract(
  options: OsmRoadAcquisitionOptions,
): Promise<AcquiredOsmRoadExtract> {
  const query = buildOverpassRoadQuery(options.bounds);
  const fetchRoads = options.fetch ?? globalThis.fetch;
  const response = await fetchRoads(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent":
        "BusyStreetsPhase1Audit/0.1 (https://github.com/regisa/busy-streets)",
    },
    body: new URLSearchParams({ data: query }).toString(),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to acquire the OSM road extract: HTTP ${response.status} ${response.statusText}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (responseIsHtml(response, bytes)) {
    throw new Error("Overpass returned HTML instead of an OSM road extract");
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error("Overpass road response is not valid JSON", { cause: error });
  }
  const parsed = parseOverpassRoads(value);
  const checksum = sha256(bytes);
  const acquiredAt = (options.now ?? (() => new Date().toISOString()))();
  const artifactDirectory = join(options.cacheDirectory, "osm", checksum);
  const localPath = join(artifactDirectory, "overpass-roads.json");
  await mkdir(artifactDirectory, { recursive: true });
  await storeVerifiedFile(localPath, bytes);
  const artifact: OsmRoadExtractArtifact = {
    id: `osm-roads:${checksum}`,
    sourceUrl: OVERPASS_ENDPOINT,
    query,
    acquiredAt,
    osmBaseTimestamp: parsed.osmBaseTimestamp,
    sha256: checksum,
    byteSize: bytes.byteLength,
    crs: "EPSG:4326",
    parserVersion: "1",
    bounds: options.bounds,
    license: {
      code: "odbl-1.0",
      url: ODBL_URL,
      evidenceUrl: OSM_COPYRIGHT_URL,
      attribution: "OpenStreetMap contributors",
      redistributionAllowed: true,
      verifiedAt: "2026-08-29",
    },
    schemaVersion: 1,
  };
  const provenanceName = `provenance-${sha256(
    new TextEncoder().encode(acquiredAt),
  ).slice(0, 12)}.json`;
  const provenancePath = join(artifactDirectory, provenanceName);
  await storeVerifiedFile(
    provenancePath,
    new TextEncoder().encode(`${JSON.stringify(artifact, null, 2)}\n`),
  );
  return { artifact, localPath, provenancePath };
}

function validateBounds(bounds: Wgs84BoundingBox): void {
  const values = [bounds.west, bounds.south, bounds.east, bounds.north];
  if (!values.every(Number.isFinite)) throw new Error("OSM bounds must be finite");
  if (
    bounds.west < -180 ||
    bounds.east > 180 ||
    bounds.south < -90 ||
    bounds.north > 90 ||
    bounds.west >= bounds.east ||
    bounds.south >= bounds.north
  ) {
    throw new Error("OSM bounds must be an ordered WGS84 rectangle");
  }
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

function responseIsHtml(response: Response, bytes: Uint8Array): boolean {
  if (response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
    return true;
  }
  const prefix = new TextDecoder().decode(bytes.slice(0, 64)).trimStart();
  return /^<!doctype html|^<html/i.test(prefix);
}
