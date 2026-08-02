import { deflateRawSync } from 'node:zlib';

export interface ZipFixtureEntry {
  path: string;
  content?: string | Buffer;
  method?: number;
  flags?: number;
  externalFileAttributes?: number;
  versionMadeBy?: number;
  localExtra?: Buffer;
  centralExtra?: Buffer;
  comment?: Buffer;
  descriptor?: 'none' | 'signature' | 'no-signature';
}

export interface ZipFixtureOptions {
  archiveComment?: Buffer;
  prefix?: Buffer;
  interEntryPadding?: Buffer;
  preCentralPadding?: Buffer;
  trailer?: Buffer;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

export function fixtureCrc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZipFixture(
  entries: readonly ZipFixtureEntry[],
  options: ZipFixtureOptions = {}
) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = options.prefix?.length ?? 0;
  if (options.prefix) localParts.push(options.prefix);

  for (const [index, definition] of entries.entries()) {
    const name = Buffer.from(definition.path, 'utf8');
    const content = Buffer.isBuffer(definition.content)
      ? definition.content
      : Buffer.from(definition.content ?? '');
    const method = definition.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(content) : content;
    const descriptorKind = definition.descriptor ?? 'none';
    const flags = (definition.flags ?? 0) | (descriptorKind === 'none' ? 0 : 0x0008);
    const crc = fixtureCrc32(content);
    const localExtra = definition.localExtra ?? Buffer.alloc(0);
    const centralExtra = definition.centralExtra ?? Buffer.alloc(0);
    const comment = definition.comment ?? Buffer.alloc(0);
    const local = Buffer.alloc(30 + name.length + localExtra.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    if (descriptorKind === 'none') {
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(content.length, 22);
    }
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    name.copy(local, 30);
    localExtra.copy(local, 30 + name.length);

    let descriptor = Buffer.alloc(0);
    if (descriptorKind !== 'none') {
      descriptor = Buffer.alloc(descriptorKind === 'signature' ? 16 : 12);
      const base = descriptorKind === 'signature' ? 4 : 0;
      if (base === 4) descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(crc, base);
      descriptor.writeUInt32LE(compressed.length, base + 4);
      descriptor.writeUInt32LE(content.length, base + 8);
    }

    const central = Buffer.alloc(46 + name.length + centralExtra.length + comment.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(definition.versionMadeBy ?? 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(centralExtra.length, 30);
    central.writeUInt16LE(comment.length, 32);
    central.writeUInt32LE((definition.externalFileAttributes ?? 0) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralExtra.copy(central, 46 + name.length);
    comment.copy(central, 46 + name.length + centralExtra.length);

    localParts.push(local, compressed, descriptor);
    offset += local.length + compressed.length + descriptor.length;
    if (index < entries.length - 1 && options.interEntryPadding) {
      localParts.push(options.interEntryPadding);
      offset += options.interEntryPadding.length;
    }
    centralParts.push(central);
  }

  if (options.preCentralPadding) {
    localParts.push(options.preCentralPadding);
    offset += options.preCentralPadding.length;
  }
  const centralOffset = offset;
  const central = Buffer.concat(centralParts);
  const archiveComment = options.archiveComment ?? Buffer.alloc(0);
  const end = Buffer.alloc(22 + archiveComment.length);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(archiveComment.length, 20);
  archiveComment.copy(end, 22);
  return Buffer.concat([...localParts, central, end, options.trailer ?? Buffer.alloc(0)]);
}
