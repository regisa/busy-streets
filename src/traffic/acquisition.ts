import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { SourceArtifact, SourceDefinition } from "./contracts.js";

export interface AcquisitionOptions {
  readonly cacheDirectory: string;
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => string;
}

export interface ManualRegistrationOptions {
  readonly cacheDirectory: string;
  readonly now: () => string;
}

export interface ArtifactAcquisitionRequest {
  readonly sourceUrl: string;
  readonly fallbackFilename?: string;
  readonly crs: string | null;
}

export type AcquisitionResult =
  | {
      readonly kind: "acquired";
      readonly artifact: SourceArtifact;
      readonly localPath: string;
    }
  | {
      readonly kind: "manual-input-required";
      readonly sourceId: string;
      readonly reason: string;
      readonly expectedFormats: readonly string[];
    };

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isHtml(contentType: string | null, bytes: Uint8Array): boolean {
  if (contentType?.toLowerCase().includes("text/html")) return true;
  const prefix = new TextDecoder().decode(bytes.slice(0, 64)).trimStart();
  return /^<!doctype html|^<html/i.test(prefix);
}

function responseFilename(
  response: Response,
  source: SourceDefinition,
  fallbackFilename?: string,
): string {
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i);
  if (match?.[1]) return basename(decodeURIComponent(match[1].replace(/"$/, "")));
  if (fallbackFilename) return basename(fallbackFilename);

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("zip")) return `${source.id}.zip`;
  if (contentType.includes("json")) return `${source.id}.geojson`;
  return `${source.id}.shp`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function storeArtifact(
  source: SourceDefinition,
  filename: string,
  bytes: Uint8Array,
  acquiredAt: string,
  cacheDirectory: string,
  sourceUrl: string,
  crs: string | null,
): Promise<{ artifact: SourceArtifact; localPath: string }> {
  const checksum = sha256(bytes);
  const artifactDirectory = join(cacheDirectory, "raw", source.id, checksum);
  const localPath = join(artifactDirectory, basename(filename));
  await mkdir(artifactDirectory, { recursive: true });

  if (!(await fileExists(localPath))) await writeFile(localPath, bytes);

  const artifact: SourceArtifact = {
    id: `${source.id}:${checksum}`,
    sourceId: source.id,
    sourceUrl,
    originalFilename: basename(filename),
    acquiredAt,
    sha256: checksum,
    byteSize: bytes.byteLength,
    crs,
    adapterVersion: source.adapterVersion,
    license: source.license,
  };

  const provenancePath = join(
    artifactDirectory,
    `provenance-${sha256(new TextEncoder().encode(acquiredAt)).slice(0, 12)}.json`,
  );
  if (!(await fileExists(provenancePath))) {
    await writeFile(provenancePath, `${JSON.stringify(artifact, null, 2)}\n`);
  }

  return { artifact, localPath };
}

export async function acquireSource(
  source: SourceDefinition,
  options: AcquisitionOptions,
): Promise<AcquisitionResult> {
  return acquireRequestedArtifact(
    source,
    { sourceUrl: source.resourceUrl, crs: null },
    options,
  );
}

export async function acquireRequestedArtifact(
  source: SourceDefinition,
  request: ArtifactAcquisitionRequest,
  options: AcquisitionOptions,
): Promise<AcquisitionResult> {
  const response = await options.fetch(request.sourceUrl);

  if (response.status === 403 || response.status === 401) {
    return {
      kind: "manual-input-required",
      sourceId: source.id,
      reason: `official resource returned HTTP ${response.status}`,
      expectedFormats: source.expectedFormats,
    };
  }

  if (!response.ok) {
    throw new Error(
      `Failed to acquire ${source.id}: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (isHtml(response.headers.get("content-type"), bytes)) {
    return {
      kind: "manual-input-required",
      sourceId: source.id,
      reason: "official resource returned HTML instead of a data artifact",
      expectedFormats: source.expectedFormats,
    };
  }

  const stored = await storeArtifact(
    source,
    responseFilename(response, source, request.fallbackFilename),
    bytes,
    options.now(),
    options.cacheDirectory,
    request.sourceUrl,
    request.crs,
  );
  return { kind: "acquired", ...stored };
}

export async function registerManualArtifact(
  source: SourceDefinition,
  suppliedPath: string,
  options: ManualRegistrationOptions,
): Promise<{ artifact: SourceArtifact; localPath: string }> {
  const bytes = new Uint8Array(await readFile(suppliedPath));
  const stored = await storeArtifact(
    source,
    basename(suppliedPath),
    bytes,
    options.now(),
    options.cacheDirectory,
    source.datasetUrl,
    null,
  );

  return stored;
}
