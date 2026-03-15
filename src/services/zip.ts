type ZipEntry = {
  name: string;
  data: Uint8Array;
};

type CentralDirectoryEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

function toArrayBufferView(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(data);
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatArrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  await writer.write(toArrayBufferView(data));
  await writer.close();
  const response = new Response(stream.readable);
  return new Uint8Array(await response.arrayBuffer());
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error('ZIP end of central directory not found.');
}

function parseCentralDirectory(bytes: Uint8Array): CentralDirectoryEntry[] {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const eocdView = new DataView(bytes.buffer, bytes.byteOffset + eocdOffset);
  const centralDirectorySize = eocdView.getUint32(12, true);
  const centralDirectoryOffset = eocdView.getUint32(16, true);
  const decoder = new TextDecoder('utf-8');
  const entries: CentralDirectoryEntry[] = [];
  let offset = centralDirectoryOffset;
  const limit = centralDirectoryOffset + centralDirectorySize;

  while (offset + 46 <= limit) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x02014b50) {
      break;
    }

    const compressionMethod = view.getUint16(10, true);
    const compressedSize = view.getUint32(20, true);
    const uncompressedSize = view.getUint32(24, true);
    const fileNameLength = view.getUint16(28, true);
    const extraLength = view.getUint16(30, true);
    const commentLength = view.getUint16(32, true);
    const localHeaderOffset = view.getUint32(42, true);
    const nameStart = offset + 46;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset = nameStart + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function getEntryBytes(bytes: Uint8Array, entry: CentralDirectoryEntry): Uint8Array {
  const localHeader = new DataView(bytes.buffer, bytes.byteOffset + entry.localHeaderOffset);
  if (localHeader.getUint32(0, true) !== 0x04034b50) {
    throw new Error(`Local file header not found for ${entry.name}.`);
  }
  const fileNameLength = localHeader.getUint16(26, true);
  const extraLength = localHeader.getUint16(28, true);
  const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  return bytes.slice(dataStart, dataStart + entry.compressedSize);
}

export async function readZipEntries(file: File): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = new Map<string, Uint8Array>();
  const centralEntries = parseCentralDirectory(bytes);

  for (const entry of centralEntries) {
    const compressed = getEntryBytes(bytes, entry);
    if (entry.compressionMethod === 0) {
      entries.set(entry.name, compressed);
      continue;
    }
    if (entry.compressionMethod === 8) {
      entries.set(entry.name, await inflateRaw(compressed));
      continue;
    }
    throw new Error(`Unsupported zip compression method: ${entry.compressionMethod}`);
  }

  return entries;
}

export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const fileParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, entry.data.length);
    writeUint32(localView, 22, entry.data.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, entry.data.length);
    writeUint32(centralView, 24, entry.data.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);

    fileParts.push(localHeader, entry.data);
    centralParts.push(centralHeader);
    offset += localHeader.length + entry.data.length;
  }

  const centralDirectory = concatArrays(centralParts);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralDirectory.length);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  return new Blob(
    [...fileParts.map(toArrayBufferView), toArrayBufferView(centralDirectory), toArrayBufferView(endRecord)],
    { type: 'application/zip' },
  );
}
