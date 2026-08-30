import type { SourceDefinition, Wgs84BoundingBox } from "./contracts.js";
import {
  acquireRequestedArtifact,
  type AcquisitionOptions,
  type AcquisitionResult,
} from "./acquisition.js";

export interface WfsSampleAcquisitionOptions extends AcquisitionOptions {
  readonly sampleSize: number;
}

export interface WfsBoundingBoxSampleAcquisitionOptions
  extends WfsSampleAcquisitionOptions {
  readonly boundingBox: Wgs84BoundingBox;
}

export function buildWfsSampleUrl(
  source: SourceDefinition,
  sampleSize: number,
): string {
  if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 1000) {
    throw new Error("WFS sample size must be an integer from 1 through 1000");
  }
  if (!source.wfs) {
    throw new Error(`Source ${source.id} does not define WFS access`);
  }

  const parameters = new URLSearchParams();
  parameters.set("service", "WFS");
  parameters.set("version", source.wfs.version);
  parameters.set("request", "GetFeature");
  parameters.set("typeNames", source.wfs.typeName);
  parameters.set("outputFormat", source.wfs.outputFormat);
  parameters.set("srsName", source.wfs.outputCrs);
  parameters.set("count", String(sampleSize));

  return `${source.wfs.endpoint}?${parameters.toString()}`;
}

export function buildWfsBoundingBoxSampleUrl(
  source: SourceDefinition,
  sampleSize: number,
  boundingBox: Wgs84BoundingBox,
): string {
  if (!source.wfs) {
    throw new Error(`Source ${source.id} does not define WFS access`);
  }
  const url = new URL(buildWfsSampleUrl(source, sampleSize));
  const coordinates = [
    boundingBox.west,
    boundingBox.south,
    boundingBox.east,
    boundingBox.north,
  ];
  if (
    coordinates.some((coordinate) => !Number.isFinite(coordinate)) ||
    boundingBox.west < -180 ||
    boundingBox.east > 180 ||
    boundingBox.south < -90 ||
    boundingBox.north > 90 ||
    boundingBox.west >= boundingBox.east ||
    boundingBox.south >= boundingBox.north
  ) {
    throw new Error("WFS bounding box must be a valid WGS 84 extent");
  }
  const wfsAxisOrderedCoordinates = [
    boundingBox.south,
    boundingBox.west,
    boundingBox.north,
    boundingBox.east,
  ];
  url.searchParams.set(
    "bbox",
    `${wfsAxisOrderedCoordinates.join(",")},${source.wfs.outputCrs}`,
  );
  return url.toString();
}

export function buildWfsDescribeFeatureTypeUrl(
  source: SourceDefinition,
): string {
  if (!source.wfs) {
    throw new Error(`Source ${source.id} does not define WFS access`);
  }

  const parameters = new URLSearchParams();
  parameters.set("service", "WFS");
  parameters.set("version", source.wfs.version);
  parameters.set("request", "DescribeFeatureType");
  parameters.set("typeNames", source.wfs.typeName);
  return `${source.wfs.endpoint}?${parameters.toString()}`;
}

export async function acquireWfsSample(
  source: SourceDefinition,
  options: WfsSampleAcquisitionOptions,
): Promise<AcquisitionResult> {
  if (!source.wfs) {
    return {
      kind: "manual-input-required",
      sourceId: source.id,
      reason: "source does not define WFS access",
      expectedFormats: source.expectedFormats,
    };
  }

  return acquireRequestedArtifact(
    source,
    {
      sourceUrl: buildWfsSampleUrl(source, options.sampleSize),
      fallbackFilename: `${source.id}-wfs-sample.geojson`,
      crs: source.wfs.outputCrs,
    },
    options,
  );
}

export async function acquireWfsBoundingBoxSample(
  source: SourceDefinition,
  options: WfsBoundingBoxSampleAcquisitionOptions,
): Promise<AcquisitionResult> {
  if (!source.wfs) {
    return {
      kind: "manual-input-required",
      sourceId: source.id,
      reason: "source does not define WFS access",
      expectedFormats: source.expectedFormats,
    };
  }

  return acquireRequestedArtifact(
    source,
    {
      sourceUrl: buildWfsBoundingBoxSampleUrl(
        source,
        options.sampleSize,
        options.boundingBox,
      ),
      fallbackFilename: `${source.id}-wfs-bbox-sample.geojson`,
      crs: source.wfs.outputCrs,
    },
    options,
  );
}

export async function acquireWfsSchema(
  source: SourceDefinition,
  options: AcquisitionOptions,
): Promise<AcquisitionResult> {
  if (!source.wfs) {
    return {
      kind: "manual-input-required",
      sourceId: source.id,
      reason: "source does not define WFS access",
      expectedFormats: source.expectedFormats,
    };
  }

  return acquireRequestedArtifact(
    source,
    {
      sourceUrl: buildWfsDescribeFeatureTypeUrl(source),
      fallbackFilename: `${source.id}-wfs-schema.xsd`,
      crs: null,
    },
    options,
  );
}
