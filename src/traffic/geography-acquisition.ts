import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import type { MultiPolygon } from "geojson";

import { parseBiarritzBoundary } from "./geography.js";

export const BIARRITZ_BOUNDARY_URL =
  "https://geo.api.gouv.fr/communes/64122?format=geojson&geometry=contour";

export interface BoundaryLicenseEvidence {
  readonly code: "odbl-1.0";
  readonly label: "Open Data Commons Open Database License 1.0";
  readonly url: "https://opendatacommons.org/licenses/odbl/1-0/";
  readonly evidenceUrl: "https://www.data.gouv.fr/datasets/contours-administratifs";
  readonly redistributionAllowed: true;
  readonly verifiedAt: "2026-08-29";
}

const BOUNDARY_LICENSE: BoundaryLicenseEvidence = {
  code: "odbl-1.0",
  label: "Open Data Commons Open Database License 1.0",
  url: "https://opendatacommons.org/licenses/odbl/1-0/",
  evidenceUrl: "https://www.data.gouv.fr/datasets/contours-administratifs",
  redistributionAllowed: true,
  verifiedAt: "2026-08-29",
};

export interface MunicipalityBoundaryArtifact {
  readonly id: string;
  readonly inseeCode: "64122";
  readonly sourceUrl: typeof BIARRITZ_BOUNDARY_URL;
  readonly originalFilename: "biarritz-64122.geojson";
  readonly acquiredAt: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly crs: "EPSG:4326";
  readonly adapterVersion: "1";
  readonly license: BoundaryLicenseEvidence;
  readonly schemaVersion: 1;
}

export interface BoundaryAcquisitionOptions {
  readonly cacheDirectory: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => string;
}

export interface AcquiredBiarritzBoundary {
  readonly artifact: MunicipalityBoundaryArtifact;
  readonly localPath: string;
  readonly provenancePath: string;
  readonly boundary: MultiPolygon;
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

async function storeVerifiedFile(
  path: string,
  bytes: Uint8Array,
): Promise<void> {
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

export async function acquireBiarritzBoundary(
  options: BoundaryAcquisitionOptions,
): Promise<AcquiredBiarritzBoundary> {
  const fetchBoundary = options.fetch ?? globalThis.fetch;
  const response = await fetchBoundary(BIARRITZ_BOUNDARY_URL);

  if (!response.ok) {
    throw new Error(
      `Failed to acquire the Biarritz boundary: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (responseIsHtml(response, bytes)) {
    throw new Error("Official Biarritz boundary endpoint returned HTML");
  }

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error("Official Biarritz boundary response is not valid JSON", {
      cause: error,
    });
  }

  const boundary = parseBiarritzBoundary(value);
  const checksum = sha256(bytes);
  const acquiredAt = (options.now ?? (() => new Date().toISOString()))();
  const artifactDirectory = join(
    options.cacheDirectory,
    "geography",
    "64122",
    checksum,
  );
  const localPath = join(artifactDirectory, "biarritz-64122.geojson");
  await mkdir(artifactDirectory, { recursive: true });
  await storeVerifiedFile(localPath, bytes);

  const artifact: MunicipalityBoundaryArtifact = {
    id: `commune-64122:${checksum}`,
    inseeCode: "64122",
    sourceUrl: BIARRITZ_BOUNDARY_URL,
    originalFilename: "biarritz-64122.geojson",
    acquiredAt,
    sha256: checksum,
    byteSize: bytes.byteLength,
    crs: "EPSG:4326",
    adapterVersion: "1",
    license: BOUNDARY_LICENSE,
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

  return { artifact, localPath, provenancePath, boundary };
}
