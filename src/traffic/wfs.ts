import type { SourceDefinition } from "./contracts.js";
import {
  acquireRequestedArtifact,
  type AcquisitionOptions,
  type AcquisitionResult,
} from "./acquisition.js";

export interface WfsSampleAcquisitionOptions extends AcquisitionOptions {
  readonly sampleSize: number;
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
