import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { XMLParser } from "fast-xml-parser";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import proj4 from "proj4";
import { open as openShapefile } from "shapefile";
import { Open, type File as ZipFile } from "unzipper";

import type {
  SourceArtifact,
  SourceFieldInspection,
  SourceInspection,
} from "./contracts.js";

export interface ArtifactInspectionInput {
  readonly artifact: SourceArtifact;
  readonly localPath: string;
  readonly encoding?: string;
}

interface FieldStatistics {
  readonly inferredTypes: Set<string>;
  nullCount: number;
  readonly sampleValues: unknown[];
  readonly sampleKeys: Set<string>;
}

const TYPE_ORDER = ["boolean", "number", "string", "array", "object"];
const MAX_SAMPLE_VALUES = 3;

function valueType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value !== null && typeof value === "object") return "object";
  return typeof value;
}

function sampleKey(value: unknown): string {
  return JSON.stringify(value);
}

class FeatureInspector {
  readonly geometryTypes = new Set<string>();
  readonly fields = new Map<string, FieldStatistics>();
  recordCount = 0;

  add(feature: Feature<Geometry | null, GeoJsonProperties>): void {
    if (feature.geometry) this.geometryTypes.add(feature.geometry.type);
    const properties = feature.properties ?? {};

    for (const [name, statistics] of this.fields) {
      if (!(name in properties) || properties[name] == null) {
        statistics.nullCount += 1;
      }
    }

    for (const [name, value] of Object.entries(properties)) {
      let statistics = this.fields.get(name);
      if (!statistics) {
        statistics = {
          inferredTypes: new Set<string>(),
          nullCount: this.recordCount + (value == null ? 1 : 0),
          sampleValues: [],
          sampleKeys: new Set<string>(),
        };
        this.fields.set(name, statistics);
      }

      if (value == null) continue;
      statistics.inferredTypes.add(valueType(value));
      const key = sampleKey(value);
      if (
        statistics.sampleValues.length < MAX_SAMPLE_VALUES &&
        !statistics.sampleKeys.has(key)
      ) {
        statistics.sampleKeys.add(key);
        statistics.sampleValues.push(value);
      }
    }

    this.recordCount += 1;
  }

  fieldInspections(): SourceFieldInspection[] {
    return [...this.fields.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, statistics]) => ({
        name,
        inferredTypes: [...statistics.inferredTypes].sort(
          (left, right) => TYPE_ORDER.indexOf(left) - TYPE_ORDER.indexOf(right),
        ),
        nullCount: statistics.nullCount,
        sampleValues: statistics.sampleValues,
      }));
  }
}

function parseFeatureCollection(value: unknown): readonly Feature[] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    value.type !== "FeatureCollection" ||
    !("features" in value) ||
    !Array.isArray(value.features)
  ) {
    throw new Error("GeoJSON artifact must contain a FeatureCollection");
  }
  return value.features as readonly Feature[];
}

function canonicalCrs(projection: string): string {
  if (/^\s*PROJCS\s*\[/i.test(projection)) {
    const rootAuthority = projection.match(
      /AUTHORITY\s*\[\s*["']EPSG["']\s*,\s*["'](\d+)["']\s*\]\s*\]\s*$/i,
    );
    if (rootAuthority?.[1]) return `EPSG:${rootAuthority[1]}`;
    if (/^\s*PROJCS\s*\[\s*["'](?:RGF93\s*\/\s*)?Lambert[ _-]?93["']/i.test(projection)) {
      return "EPSG:2154";
    }
    return projection;
  }

  if (/^\s*GEOGCS\s*\[/i.test(projection)) {
    const rootAuthority = projection.match(
      /AUTHORITY\s*\[\s*["']EPSG["']\s*,\s*["'](\d+)["']\s*\]\s*\]\s*$/i,
    );
    if (rootAuthority?.[1]) return `EPSG:${rootAuthority[1]}`;
    if (
      /^\s*GEOGCS\s*\[\s*["']WGS[ _]?(?:84|1984)["']/i.test(projection)
    ) {
      return "EPSG:4326";
    }
  }
  return projection;
}

async function streamHeaderAndSize(
  file: ZipFile,
  headerSize: number,
): Promise<{ readonly header: Buffer; readonly byteSize: number }> {
  const header = Buffer.alloc(headerSize);
  let byteSize = 0;
  for await (const chunk of file.stream()) {
    const bytes = Buffer.from(chunk as Uint8Array);
    if (byteSize < headerSize) {
      bytes.copy(
        header,
        byteSize,
        0,
        Math.min(bytes.length, headerSize - byteSize),
      );
    }
    byteSize += bytes.length;
  }
  return { header, byteSize };
}

async function validateShx(
  file: ZipFile,
  shpByteSize: number,
  shpShapeType: number,
): Promise<
  readonly {
    readonly offsetWords: number;
    readonly contentLengthWords: number;
  }[] | null
> {
  let pending = Buffer.alloc(0);
  let header = Buffer.alloc(0);
  let byteSize = 0;
  let expectedOffsetWords = 50;
  const records: Array<{
    readonly offsetWords: number;
    readonly contentLengthWords: number;
  }> = [];

  for await (const chunk of file.stream()) {
    const bytes = Buffer.from(chunk as Uint8Array);
    byteSize += bytes.length;
    pending = Buffer.concat([pending, bytes]);

    if (header.length < 100) {
      const needed = 100 - header.length;
      const take = Math.min(needed, pending.length);
      header = Buffer.concat([header, pending.subarray(0, take)]);
      pending = pending.subarray(take);
    }

    while (header.length === 100 && pending.length >= 8) {
      const offsetWords = pending.readInt32BE(0);
      const contentLengthWords = pending.readInt32BE(4);
      if (
        offsetWords !== expectedOffsetWords ||
        contentLengthWords < 2
      ) {
        return null;
      }
      expectedOffsetWords = offsetWords + 4 + contentLengthWords;
      records.push({ offsetWords, contentLengthWords });
      pending = pending.subarray(8);
    }
  }

  if (
    header.length !== 100 ||
    pending.length !== 0 ||
    byteSize < 100 ||
    (byteSize - 100) % 8 !== 0 ||
    header.readInt32BE(0) !== 9994 ||
    header.readInt32BE(24) * 2 !== byteSize ||
    header.readInt32LE(28) !== 1000 ||
    header.readInt32LE(32) !== shpShapeType ||
    expectedOffsetWords * 2 !== shpByteSize
  ) {
    return null;
  }
  return records;
}

async function shpRecordsMatchIndex(
  file: ZipFile,
  indexRecords: readonly {
    readonly offsetWords: number;
    readonly contentLengthWords: number;
  }[],
): Promise<boolean> {
  let headerBytesRemaining = 100;
  let recordHeader = Buffer.alloc(0);
  let contentBytesRemaining = 0;
  let recordIndex = 0;

  for await (const chunk of file.stream()) {
    let pending = Buffer.from(chunk as Uint8Array);
    while (pending.length > 0) {
      if (headerBytesRemaining > 0) {
        const take = Math.min(headerBytesRemaining, pending.length);
        headerBytesRemaining -= take;
        pending = pending.subarray(take);
        continue;
      }
      if (contentBytesRemaining > 0) {
        const take = Math.min(contentBytesRemaining, pending.length);
        contentBytesRemaining -= take;
        pending = pending.subarray(take);
        continue;
      }

      const needed = 8 - recordHeader.length;
      const take = Math.min(needed, pending.length);
      recordHeader = Buffer.concat([
        recordHeader,
        pending.subarray(0, take),
      ]);
      pending = pending.subarray(take);
      if (recordHeader.length < 8) continue;

      const indexRecord = indexRecords[recordIndex];
      if (
        !indexRecord ||
        recordHeader.readInt32BE(0) !== recordIndex + 1 ||
        recordHeader.readInt32BE(4) !== indexRecord.contentLengthWords
      ) {
        return false;
      }
      contentBytesRemaining = indexRecord.contentLengthWords * 2;
      recordIndex += 1;
      recordHeader = Buffer.alloc(0);
    }
  }

  return (
    headerBytesRemaining === 0 &&
    recordHeader.length === 0 &&
    contentBytesRemaining === 0 &&
    recordIndex === indexRecords.length
  );
}

async function dbfRecordsAreStructurallyPresent(
  file: ZipFile,
  headerSize: number,
  recordSize: number,
  recordCount: number,
): Promise<boolean> {
  let absoluteOffset = 0;
  let checkedRecords = 0;
  let lastByte: number | null = null;

  for await (const chunk of file.stream()) {
    const bytes = Buffer.from(chunk as Uint8Array);
    const chunkEnd = absoluteOffset + bytes.length;
    while (checkedRecords < recordCount) {
      const markerOffset = headerSize + checkedRecords * recordSize;
      if (markerOffset < absoluteOffset || markerOffset >= chunkEnd) break;
      const marker = bytes[markerOffset - absoluteOffset];
      if (marker !== 0x20 && marker !== 0x2a) return false;
      checkedRecords += 1;
    }
    if (bytes.length > 0) lastByte = bytes[bytes.length - 1] ?? null;
    absoluteOffset = chunkEnd;
  }

  const recordsEnd = headerSize + recordCount * recordSize;
  return (
    checkedRecords === recordCount &&
    (absoluteOffset === recordsEnd ||
      (absoluteOffset === recordsEnd + 1 && lastByte === 0x1a))
  );
}

async function inspectGeoJson(
  input: ArtifactInspectionInput,
): Promise<SourceInspection> {
  if (!input.artifact.crs) {
    throw new Error(
      `Cannot inspect ${input.artifact.id} without CRS evidence`,
    );
  }
  const value: unknown = JSON.parse(await readFile(input.localPath, "utf8"));
  const inspector = new FeatureInspector();
  for (const feature of parseFeatureCollection(value)) inspector.add(feature);

  return {
    sourceId: input.artifact.sourceId,
    artifactId: input.artifact.id,
    geometryTypes: [...inspector.geometryTypes].sort(),
    crs: input.artifact.crs,
    encoding: "utf-8",
    recordCount: inspector.recordCount,
    fields: inspector.fieldInspections(),
    issues: [],
  };
}

async function inspectShapefileZip(
  input: ArtifactInspectionInput,
): Promise<SourceInspection> {
  let directory: Awaited<ReturnType<typeof Open.file>>;
  try {
    directory = await Open.file(input.localPath);
  } catch (error) {
    throw new Error(`Malformed ZIP artifact ${input.artifact.id}`, {
      cause: error,
    });
  }

  const files = directory.files.filter((file) => file.type === "File");
  const byLowercasePath = new Map(
    files.map((file) => [file.path.toLowerCase(), file]),
  );
  const sets = files
    .filter((file) => file.path.toLowerCase().endsWith(".shp"))
    .map((shp) => {
      const stem = shp.path.slice(0, -4).toLowerCase();
      return {
        shp,
        dbf: byLowercasePath.get(`${stem}.dbf`),
        shx: byLowercasePath.get(`${stem}.shx`),
        prj: byLowercasePath.get(`${stem}.prj`),
        cpg: byLowercasePath.get(`${stem}.cpg`),
      };
    });

  if (sets.length !== 1) {
    throw new Error(`ZIP artifact ${input.artifact.id} has no Shapefile set`);
  }

  const set = sets[0];
  if (!set) {
    throw new Error(`ZIP artifact ${input.artifact.id} has no Shapefile set`);
  }
  if (!set.dbf) {
    throw new Error(`ZIP artifact ${input.artifact.id} has no DBF attributes`);
  }
  if (!set.shx) {
    throw new Error(`ZIP artifact ${input.artifact.id} has no SHX index`);
  }
  const shpMetadata = await streamHeaderAndSize(set.shp, 100);
  const validShp =
    shpMetadata.byteSize >= 100 &&
    shpMetadata.header.readInt32BE(0) === 9994 &&
    shpMetadata.header.readInt32BE(24) * 2 === shpMetadata.byteSize &&
    shpMetadata.header.readInt32LE(28) === 1000;
  if (!validShp) {
    throw new Error(
      `ZIP artifact ${input.artifact.id} has an invalid SHP geometry file`,
    );
  }
  const shxRecords = await validateShx(
    set.shx,
    shpMetadata.byteSize,
    shpMetadata.header.readInt32LE(32),
  );
  if (shxRecords === null || !(await shpRecordsMatchIndex(set.shp, shxRecords))) {
    throw new Error(
      `ZIP artifact ${input.artifact.id} has an invalid SHX index`,
    );
  }
  const dbfMetadata = await streamHeaderAndSize(set.dbf, 32);
  const dbfRecordCount =
    dbfMetadata.byteSize >= 32
      ? dbfMetadata.header.readUInt32LE(4)
      : -1;
  const dbfHeaderSize =
    dbfMetadata.byteSize >= 32
      ? dbfMetadata.header.readUInt16LE(8)
      : -1;
  const dbfRecordSize =
    dbfMetadata.byteSize >= 32
      ? dbfMetadata.header.readUInt16LE(10)
      : -1;
  const minimumDbfSize = dbfHeaderSize + dbfRecordCount * dbfRecordSize;
  if (
    dbfHeaderSize < 33 ||
    dbfRecordSize < 1 ||
    minimumDbfSize > dbfMetadata.byteSize ||
    dbfMetadata.byteSize > minimumDbfSize + 1
  ) {
    throw new Error(
      `ZIP artifact ${input.artifact.id} has an invalid DBF attributes file`,
    );
  }
  if (
    !(await dbfRecordsAreStructurallyPresent(
      set.dbf,
      dbfHeaderSize,
      dbfRecordSize,
      dbfRecordCount,
    ))
  ) {
    throw new Error(
      `ZIP artifact ${input.artifact.id} has an invalid DBF attributes file`,
    );
  }
  if (dbfRecordCount !== shxRecords.length) {
    throw new Error(
      `ZIP artifact ${input.artifact.id} has mismatched component record counts`,
    );
  }
  if (!set.prj) {
    throw new Error(`ZIP artifact ${input.artifact.id} has no CRS evidence`);
  }
  const projection = (await set.prj.buffer()).toString("utf8").trim();
  let crs: string;
  try {
    new proj4.Proj(projection);
    crs = canonicalCrs(projection);
  } catch (error) {
    throw new Error(`Unknown CRS in ZIP artifact ${input.artifact.id}`, {
      cause: error,
    });
  }

  const rawEncoding =
    input.encoding?.trim() ||
    (set.cpg ? (await set.cpg.buffer()).toString("utf8").trim() : null);
  if (!rawEncoding) {
    throw new Error(
      `ZIP artifact ${input.artifact.id} has no encoding evidence; provide an encoding override`,
    );
  }
  const encoding = /^utf-?8$/i.test(rawEncoding)
    ? "utf-8"
    : rawEncoding.toLowerCase();
  const source = await openShapefile(
    set.shp.stream(),
    set.dbf.stream(),
    { encoding },
  );
  const inspector = new FeatureInspector();
  while (true) {
    const record = await source.read();
    if (record.done) break;
    inspector.add(record.value);
  }
  if (inspector.recordCount !== shxRecords.length) {
    throw new Error(
      `ZIP artifact ${input.artifact.id} has mismatched component record counts`,
    );
  }

  return {
    sourceId: input.artifact.sourceId,
    artifactId: input.artifact.id,
    geometryTypes: [...inspector.geometryTypes].sort(),
    crs,
    encoding,
    recordCount: inspector.recordCount,
    fields: inspector.fieldInspections(),
    issues: [],
  };
}

export async function inspectArtifact(
  input: ArtifactInspectionInput,
): Promise<SourceInspection> {
  const extension = extname(input.localPath).toLowerCase();
  if (extension === ".geojson" || extension === ".json") {
    return inspectGeoJson(input);
  }
  if (extension === ".zip") return inspectShapefileZip(input);
  throw new Error(`Unsupported inspection artifact: ${extension || "no extension"}`);
}

export function serializeSourceInspection(
  inspection: SourceInspection,
): string {
  return `${JSON.stringify(inspection, null, 2)}\n`;
}

interface WfsFieldDeclaration {
  readonly name: string;
  readonly type: string;
}

function sequenceElements(value: unknown): WfsFieldDeclaration[] {
  const declarations: WfsFieldDeclaration[] = [];

  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const object = node as Record<string, unknown>;
    const sequence = object.sequence;
    if (typeof sequence === "object" && sequence !== null) {
      const elements = (sequence as Record<string, unknown>).element;
      const values = Array.isArray(elements) ? elements : [elements];
      for (const element of values) {
        if (typeof element !== "object" || element === null) continue;
        const candidate = element as Record<string, unknown>;
        if (typeof candidate.name === "string" && typeof candidate.type === "string") {
          declarations.push({ name: candidate.name, type: candidate.type });
        }
      }
    }
    for (const child of Object.values(object)) visit(child);
  }

  visit(value);
  return declarations;
}

function wfsValueType(type: string): string | null {
  if (type.toLowerCase().startsWith("gml:")) return null;
  const localType = type.split(":").at(-1)?.toLowerCase() ?? "";
  if (
    [
      "byte",
      "decimal",
      "double",
      "float",
      "int",
      "integer",
      "long",
      "nonnegativeinteger",
      "short",
    ].includes(localType)
  ) {
    return "number";
  }
  if (localType === "boolean") return "boolean";
  if (["date", "datetime", "string"].includes(localType)) return "string";
  return null;
}

export async function enrichInspectionWithWfsSchema(
  inspection: SourceInspection,
  schema: ArtifactInspectionInput,
): Promise<SourceInspection> {
  if (schema.artifact.sourceId !== inspection.sourceId) {
    throw new Error("WFS schema and feature sample must use the same source ID");
  }

  const parser = new XMLParser({
    attributeNamePrefix: "",
    ignoreAttributes: false,
    processEntities: false,
    removeNSPrefix: true,
  });
  const parsed: unknown = parser.parse(await readFile(schema.localPath, "utf8"));
  const fields = new Map(
    inspection.fields.map((field) => [
      field.name,
      {
        ...field,
        inferredTypes: [...field.inferredTypes],
        sampleValues: [...field.sampleValues],
      },
    ]),
  );

  const declarations = sequenceElements(parsed);
  if (declarations.length === 0) {
    throw new Error(
      `WFS schema ${schema.artifact.id} has no field declarations`,
    );
  }

  for (const declaration of declarations) {
    const inferredType = wfsValueType(declaration.type);
    if (!inferredType) continue;
    const existing = fields.get(declaration.name);
    if (existing) {
      if (!existing.inferredTypes.includes(inferredType)) {
        existing.inferredTypes.push(inferredType);
        existing.inferredTypes.sort(
          (left, right) => TYPE_ORDER.indexOf(left) - TYPE_ORDER.indexOf(right),
        );
      }
      continue;
    }
    fields.set(declaration.name, {
      name: declaration.name,
      inferredTypes: [inferredType],
      nullCount: inspection.recordCount,
      sampleValues: [],
    });
  }

  return {
    ...inspection,
    schemaArtifactId: schema.artifact.id,
    fields: [...fields.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  };
}
