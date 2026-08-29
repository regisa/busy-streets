interface ZipEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

interface PointRecord {
  readonly x: number;
  readonly y: number;
  readonly route: string;
  readonly tmja: number;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function storedZip(entries: readonly ZipEntry[]): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const bytes = Buffer.from(entry.bytes);
    const checksum = crc32(bytes);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(bytes.length, 18);
    localHeader.writeUInt32LE(bytes.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, bytes);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(bytes.length, 20);
    centralHeader.writeUInt32LE(bytes.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.length + name.length + bytes.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function pointShp(records: readonly PointRecord[]): Uint8Array {
  const recordSize = 28;
  const bytes = Buffer.alloc(100 + records.length * recordSize);
  bytes.writeInt32BE(9994, 0);
  bytes.writeInt32BE(bytes.length / 2, 24);
  bytes.writeInt32LE(1000, 28);
  bytes.writeInt32LE(1, 32);

  const xs = records.map((record) => record.x);
  const ys = records.map((record) => record.y);
  bytes.writeDoubleLE(Math.min(...xs), 36);
  bytes.writeDoubleLE(Math.min(...ys), 44);
  bytes.writeDoubleLE(Math.max(...xs), 52);
  bytes.writeDoubleLE(Math.max(...ys), 60);

  records.forEach((record, index) => {
    const offset = 100 + index * recordSize;
    bytes.writeInt32BE(index + 1, offset);
    bytes.writeInt32BE(10, offset + 4);
    bytes.writeInt32LE(1, offset + 8);
    bytes.writeDoubleLE(record.x, offset + 12);
    bytes.writeDoubleLE(record.y, offset + 20);
  });
  return bytes;
}

function pointShx(records: readonly PointRecord[]): Uint8Array {
  const bytes = Buffer.alloc(100 + records.length * 8);
  bytes.writeInt32BE(9994, 0);
  bytes.writeInt32BE(bytes.length / 2, 24);
  bytes.writeInt32LE(1000, 28);
  bytes.writeInt32LE(1, 32);

  const xs = records.map((record) => record.x);
  const ys = records.map((record) => record.y);
  bytes.writeDoubleLE(Math.min(...xs), 36);
  bytes.writeDoubleLE(Math.min(...ys), 44);
  bytes.writeDoubleLE(Math.max(...xs), 52);
  bytes.writeDoubleLE(Math.max(...ys), 60);

  records.forEach((_record, index) => {
    const offset = 100 + index * 8;
    bytes.writeInt32BE((100 + index * 28) / 2, offset);
    bytes.writeInt32BE(10, offset + 4);
  });
  return bytes;
}

function writeField(
  bytes: Buffer,
  offset: number,
  name: string,
  type: "C" | "N",
  length: number,
): void {
  bytes.write(name, offset, 11, "ascii");
  bytes.write(type, offset + 11, 1, "ascii");
  bytes.writeUInt8(length, offset + 16);
}

function pointDbf(records: readonly PointRecord[]): Uint8Array {
  const headerLength = 97;
  const recordLength = 21;
  const bytes = Buffer.alloc(headerLength + records.length * recordLength + 1);
  bytes.writeUInt8(0x03, 0);
  bytes.writeUInt8(126, 1);
  bytes.writeUInt8(8, 2);
  bytes.writeUInt8(29, 3);
  bytes.writeUInt32LE(records.length, 4);
  bytes.writeUInt16LE(headerLength, 8);
  bytes.writeUInt16LE(recordLength, 10);
  writeField(bytes, 32, "route", "C", 12);
  writeField(bytes, 64, "tmja", "N", 8);
  bytes.writeUInt8(0x0d, 96);

  records.forEach((record, index) => {
    const offset = headerLength + index * recordLength;
    bytes.write(" ", offset, 1, "ascii");
    bytes.write(record.route.padEnd(12), offset + 1, 12, "utf8");
    bytes.write(String(record.tmja).padStart(8), offset + 13, 8, "ascii");
  });
  bytes.writeUInt8(0x1a, bytes.length - 1);
  return bytes;
}

export function pointShapefileZip(
  records: readonly PointRecord[],
  options: {
    readonly includeEncoding?: boolean;
    readonly includeIndex?: boolean;
    readonly includeProjection?: boolean;
    readonly encodingDeclaration?: string;
    readonly indexBytes?: Uint8Array;
    readonly projection?: string;
    readonly attributeRecords?: readonly PointRecord[];
    readonly prematureDbfEof?: boolean;
    readonly zeroIndexEntries?: boolean;
  } = {},
): Uint8Array {
  const projection = options.projection ??
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
  const dbfBytes = Buffer.from(pointDbf(options.attributeRecords ?? records));
  if (options.prematureDbfEof && dbfBytes.length > 97) {
    dbfBytes.writeUInt8(0x1a, 97);
  }
  const entries: ZipEntry[] = [
    { path: "traffic.shp", bytes: pointShp(records) },
    {
      path: "traffic.dbf",
      bytes: dbfBytes,
    },
  ];
  if (options.includeIndex !== false) {
    const indexBytes = Buffer.from(options.indexBytes ?? pointShx(records));
    if (options.zeroIndexEntries) indexBytes.fill(0, 100);
    entries.push({
      path: "traffic.shx",
      bytes: indexBytes,
    });
  }
  if (options.includeEncoding !== false) {
    entries.push({
      path: "traffic.cpg",
      bytes: Buffer.from(options.encodingDeclaration ?? "UTF-8", "utf8"),
    });
  }
  if (options.includeProjection !== false) {
    entries.push({
      path: "traffic.prj",
      bytes: Buffer.from(projection, "utf8"),
    });
  }
  return storedZip(entries);
}
