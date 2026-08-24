import {
  constants as fsConstants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync
} from 'node:fs';
import { TextDecoder } from 'node:util';
import CRC32 from 'crc-32';
import yauzl from 'yauzl';

export const BOUNDED_ZIP_LIMITS = Object.freeze({
  archiveBytes: 64 * 1024 * 1024,
  entries: 4096,
  encodedPathBytes: 1024,
  compressedEntryBytes: 16 * 1024 * 1024,
  uncompressedEntryBytes: 32 * 1024 * 1024,
  totalUncompressedBytes: 128 * 1024 * 1024,
  compressionRatio: 1000,
  openTimeoutMs: 10_000,
  entryIdleTimeoutMs: 15_000,
  entryDeadlineMs: 60_000,
  inventoryDeadlineMs: 180_000,
  closeDeadlineMs: 5_000
});

const ZIP_SIGNATURES = Object.freeze({
  local: 0x04034b50,
  central: 0x02014b50,
  descriptor: 0x08074b50,
  end: 0x06054b50,
  zip64Locator: 0x07064b50
});
const ALLOWED_FLAGS = 0x0808;
const UTF8_FLAG = 0x0800;
const DESCRIPTOR_FLAG = 0x0008;
const UNIX_FILE = 0o100000;
const UNIX_DIRECTORY = 0o040000;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function sameRegularIdentity(left, right) {
  return (
    left.isFile() &&
    right.isFile() &&
    !left.isSymbolicLink() &&
    !right.isSymbolicLink() &&
    left.dev === right.dev &&
    left.ino === right.ino
  );
}

function openRegularArchive(archivePath, dependencies) {
  const {
    closeSyncImpl = closeSync,
    fstatSyncImpl = fstatSync,
    lstatSyncImpl = lstatSync,
    openSyncImpl = openSync,
    fsConstantsImpl = fsConstants
  } = dependencies;
  const pathBefore = lstatSyncImpl(archivePath);
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink()) fail('ZIP_ARCHIVE_NOT_REGULAR');
  if (typeof fsConstantsImpl.O_NONBLOCK !== 'number') fail('ZIP_OPEN_BOUNDARY_UNAVAILABLE');
  const noFollowFlag =
    typeof fsConstantsImpl.O_NOFOLLOW === 'number' ? fsConstantsImpl.O_NOFOLLOW : 0;
  const fd = openSyncImpl(
    archivePath,
    fsConstantsImpl.O_RDONLY | fsConstantsImpl.O_NONBLOCK | noFollowFlag
  );
  try {
    const opened = fstatSyncImpl(fd);
    const pathAfter = lstatSyncImpl(archivePath);
    if (!sameRegularIdentity(opened, pathAfter) || !sameRegularIdentity(pathBefore, opened)) {
      fail('ZIP_ARCHIVE_IDENTITY_CHANGED');
    }
    return { fd, opened };
  } catch (error) {
    closeSyncImpl(fd);
    throw error;
  }
}

function readExact(fd, length, offset, label) {
  if (!Number.isSafeInteger(length) || length < 0 || !Number.isSafeInteger(offset) || offset < 0) {
    fail('ZIP_RANGE_INVALID', label);
  }
  const bytes = Buffer.alloc(length);
  let consumed = 0;
  while (consumed < length) {
    const count = readSync(fd, bytes, consumed, length - consumed, offset + consumed);
    if (count === 0) fail('ZIP_TRUNCATED', label);
    consumed += count;
  }
  return bytes;
}

function parseEndRecord(fd, fileSize) {
  if (fileSize < 22) fail('ZIP_EOCD_MISSING');
  const tailLength = Math.min(fileSize, 22 + 0xffff + 20);
  const tailOffset = fileSize - tailLength;
  const tail = readExact(fd, tailLength, tailOffset, 'eocd-tail');
  let relativeOffset = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) === ZIP_SIGNATURES.end) {
      const commentLength = tail.readUInt16LE(index + 20);
      if (tailOffset + index + 22 + commentLength === fileSize) {
        relativeOffset = index;
        break;
      }
    }
  }
  if (relativeOffset < 0) fail('ZIP_EOCD_MISSING');
  const offset = tailOffset + relativeOffset;
  const record = tail.subarray(relativeOffset, relativeOffset + 22);
  if (record.readUInt16LE(20) !== 0) fail('ZIP_ARCHIVE_COMMENT_FORBIDDEN');
  if (
    record.readUInt16LE(4) !== 0 ||
    record.readUInt16LE(6) !== 0 ||
    record.readUInt16LE(8) !== record.readUInt16LE(10)
  ) {
    fail('ZIP_MULTIDISK_FORBIDDEN');
  }
  const entryCount = record.readUInt16LE(10);
  const centralSize = record.readUInt32LE(12);
  const centralOffset = record.readUInt32LE(16);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    fail('ZIP64_FORBIDDEN');
  }
  if (offset >= 20) {
    const possibleLocator = readExact(fd, 4, offset - 20, 'zip64-locator');
    if (possibleLocator.readUInt32LE(0) === ZIP_SIGNATURES.zip64Locator) fail('ZIP64_FORBIDDEN');
  }
  if (centralOffset + centralSize !== offset) fail('ZIP_CENTRAL_RANGE_INVALID');
  return { entryCount, centralOffset, centralSize, endOffset: offset };
}

function decodeName(raw, flags) {
  if (raw.length === 0 || raw.length > BOUNDED_ZIP_LIMITS.encodedPathBytes) {
    fail('ZIP_PATH_LENGTH_INVALID');
  }
  if ((flags & UTF8_FLAG) === 0) {
    if (raw.some((byte) => byte > 0x7f)) fail('ZIP_NONASCII_NAME_WITHOUT_UTF8_FLAG');
    return raw.toString('ascii');
  }
  try {
    return utf8Decoder.decode(raw);
  } catch {
    fail('ZIP_PATH_UTF8_INVALID');
  }
}

function validatePath(raw, flags) {
  const path = decodeName(raw, flags);
  if (path !== path.normalize('NFC')) fail('ZIP_PATH_NOT_NFC', path);
  if (
    path.startsWith('/') ||
    /^[A-Za-z]:/u.test(path) ||
    path.includes('\\') ||
    /[\0-\x1f\x7f]/u.test(path)
  ) {
    fail('ZIP_PATH_UNSAFE', path);
  }
  const directory = path.endsWith('/');
  const body = directory ? path.slice(0, -1) : path;
  const components = body.split('/');
  if (
    body.length === 0 ||
    components.some(
      (component) => component.length === 0 || component === '.' || component === '..'
    )
  ) {
    fail('ZIP_PATH_UNSAFE', path);
  }
  if (`${components.join('/')}${directory ? '/' : ''}` !== path) fail('ZIP_PATH_UNSAFE', path);
  return { path, directory };
}

function parseCentralRecords(fd, end) {
  if (end.entryCount > BOUNDED_ZIP_LIMITS.entries) fail('ZIP_ENTRY_LIMIT');
  const records = [];
  let cursor = end.centralOffset;
  for (let index = 0; index < end.entryCount; index += 1) {
    const fixed = readExact(fd, 46, cursor, `central-${index}`);
    if (fixed.readUInt32LE(0) !== ZIP_SIGNATURES.central) fail('ZIP_CENTRAL_SIGNATURE_INVALID');
    const nameLength = fixed.readUInt16LE(28);
    const extraLength = fixed.readUInt16LE(30);
    const commentLength = fixed.readUInt16LE(32);
    if (extraLength !== 0) fail('ZIP_CENTRAL_EXTRA_FORBIDDEN');
    if (commentLength !== 0) fail('ZIP_ENTRY_COMMENT_FORBIDDEN');
    if (fixed.readUInt16LE(34) !== 0) fail('ZIP_MULTIDISK_FORBIDDEN');
    const flags = fixed.readUInt16LE(8);
    if ((flags & ~ALLOWED_FLAGS) !== 0) fail('ZIP_FLAGS_FORBIDDEN');
    const method = fixed.readUInt16LE(10);
    if (method !== 0 && method !== 8) fail('ZIP_METHOD_FORBIDDEN');
    const compressedSize = fixed.readUInt32LE(20);
    const uncompressedSize = fixed.readUInt32LE(24);
    const localOffset = fixed.readUInt32LE(42);
    if ([compressedSize, uncompressedSize, localOffset].includes(0xffffffff))
      fail('ZIP64_FORBIDDEN');
    const rawName = readExact(fd, nameLength, cursor + 46, `central-name-${index}`);
    const { path, directory } = validatePath(rawName, flags);
    if (compressedSize > BOUNDED_ZIP_LIMITS.compressedEntryBytes) fail('ZIP_COMPRESSED_LIMIT');
    if (uncompressedSize > BOUNDED_ZIP_LIMITS.uncompressedEntryBytes) {
      fail('ZIP_UNCOMPRESSED_LIMIT');
    }
    if (directory) {
      if (compressedSize !== 0 || uncompressedSize !== 0) fail('ZIP_DIRECTORY_SIZE_INVALID');
    } else if (uncompressedSize > 0 && compressedSize === 0) {
      fail('ZIP_COMPRESSION_RATIO_INVALID');
    } else if (
      compressedSize > 0 &&
      uncompressedSize > compressedSize * BOUNDED_ZIP_LIMITS.compressionRatio
    ) {
      fail('ZIP_COMPRESSION_RATIO_INVALID');
    }
    const platform = fixed.readUInt16LE(4) >>> 8;
    const unixMode = fixed.readUInt32LE(38) >>> 16;
    const unixType = unixMode & 0o170000;
    if (platform === 3 && unixType !== 0) {
      if (directory && unixType !== UNIX_DIRECTORY) fail('ZIP_ENTRY_TYPE_INVALID');
      if (!directory && unixType !== UNIX_FILE) fail('ZIP_ENTRY_TYPE_INVALID');
    }
    records.push({
      index,
      path,
      directory,
      flags,
      method,
      crc32: fixed.readUInt32LE(16),
      compressedSize,
      uncompressedSize,
      localOffset,
      rawName,
      externalFileAttributes: fixed.readUInt32LE(38),
      versionMadeBy: fixed.readUInt16LE(4)
    });
    cursor += 46 + nameLength;
  }
  if (cursor !== end.centralOffset + end.centralSize) fail('ZIP_CENTRAL_RANGE_INVALID');
  return records;
}

function validateNames(records) {
  const exact = new Set();
  const folded = new Set();
  const filePaths = new Set();
  const directoryPaths = new Set();
  for (const record of records) {
    if (exact.has(record.path)) fail('ZIP_DUPLICATE_PATH', record.path);
    exact.add(record.path);
    const foldedPath = record.path.toLowerCase();
    if (folded.has(foldedPath)) fail('ZIP_CASE_AMBIGUITY', record.path);
    folded.add(foldedPath);
    const normalized = record.directory ? record.path.slice(0, -1) : record.path;
    (record.directory ? directoryPaths : filePaths).add(normalized);
  }
  for (const filePath of filePaths) {
    if (directoryPaths.has(filePath)) fail('ZIP_FILE_DIRECTORY_COLLISION', filePath);
    const components = filePath.split('/');
    for (let index = 1; index < components.length; index += 1) {
      if (filePaths.has(components.slice(0, index).join('/'))) {
        fail('ZIP_FILE_DIRECTORY_PREFIX_COLLISION', filePath);
      }
    }
  }
}

function parseLocalSpan(fd, record) {
  const fixed = readExact(fd, 30, record.localOffset, `local-${record.index}`);
  if (fixed.readUInt32LE(0) !== ZIP_SIGNATURES.local) fail('ZIP_LOCAL_SIGNATURE_INVALID');
  const flags = fixed.readUInt16LE(6);
  const method = fixed.readUInt16LE(8);
  if (flags !== record.flags || method !== record.method) fail('ZIP_LOCAL_CENTRAL_MISMATCH');
  const nameLength = fixed.readUInt16LE(26);
  const extraLength = fixed.readUInt16LE(28);
  if (extraLength !== 0) fail('ZIP_LOCAL_EXTRA_FORBIDDEN');
  const rawName = readExact(fd, nameLength, record.localOffset + 30, `local-name-${record.index}`);
  if (!rawName.equals(record.rawName)) fail('ZIP_LOCAL_CENTRAL_MISMATCH');
  const localCrc = fixed.readUInt32LE(14);
  const localCompressed = fixed.readUInt32LE(18);
  const localUncompressed = fixed.readUInt32LE(22);
  const descriptor = (record.flags & DESCRIPTOR_FLAG) !== 0;
  if (!descriptor) {
    if (
      localCrc !== record.crc32 ||
      localCompressed !== record.compressedSize ||
      localUncompressed !== record.uncompressedSize
    ) {
      fail('ZIP_LOCAL_CENTRAL_MISMATCH');
    }
  } else if (
    ![0, record.crc32].includes(localCrc) ||
    ![0, record.compressedSize].includes(localCompressed) ||
    ![0, record.uncompressedSize].includes(localUncompressed)
  ) {
    fail('ZIP_LOCAL_CENTRAL_MISMATCH');
  }
  const dataStart = record.localOffset + 30 + nameLength;
  let end = dataStart + record.compressedSize;
  if (descriptor) {
    const signature = readExact(fd, 4, end, `descriptor-${record.index}`).readUInt32LE(0);
    const descriptorLength = signature === ZIP_SIGNATURES.descriptor ? 16 : 12;
    const bytes = readExact(fd, descriptorLength, end, `descriptor-${record.index}`);
    const base = descriptorLength === 16 ? 4 : 0;
    if (
      bytes.readUInt32LE(base) !== record.crc32 ||
      bytes.readUInt32LE(base + 4) !== record.compressedSize ||
      bytes.readUInt32LE(base + 8) !== record.uncompressedSize
    ) {
      fail('ZIP_DESCRIPTOR_INVALID');
    }
    end += descriptorLength;
  }
  return { start: record.localOffset, end };
}

function openZipFromFd(fd, fileSize, dependencies) {
  const { yauzlImpl = yauzl, setTimer = setTimeout, clearTimer = clearTimeout } = dependencies;
  return new Promise((resolve, reject) => {
    const timer = setTimer(
      () => reject(new Error('ZIP_OPEN_TIMEOUT')),
      BOUNDED_ZIP_LIMITS.openTimeoutMs
    );
    yauzlImpl.fromFd(
      fd,
      {
        autoClose: false,
        lazyEntries: true,
        decodeStrings: false,
        validateEntrySizes: true,
        strictFileNames: true
      },
      (error, zipFile) => {
        clearTimer(timer);
        if (error) reject(error);
        else if (zipFile.fileSize !== fileSize) reject(new Error('ZIP_FILE_SIZE_MISMATCH'));
        else resolve(zipFile);
      }
    );
  });
}

function closeZipFile(zipFile, dependencies) {
  const { setTimer = setTimeout, clearTimer = clearTimeout } = dependencies;
  if (!zipFile?.isOpen) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      zipFile.removeListener('close', onClose);
      zipFile.removeListener('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onClose = () => settle();
    const onError = (error) => settle(error);
    const timer = setTimer(
      () => settle(new Error('ZIP_CLOSE_DEADLINE')),
      BOUNDED_ZIP_LIMITS.closeDeadlineMs
    );
    zipFile.once('close', onClose);
    zipFile.once('error', onError);
    zipFile.close();
  });
}

function readEntryContent(zipFile, entry, dependencies) {
  const {
    crc32Buffer = CRC32.buf,
    setTimer = setTimeout,
    clearTimer = clearTimeout
  } = dependencies;
  if (entry.fileNameRaw.toString('utf8').endsWith('/')) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let settled = false;
    let idleTimer;
    let totalTimer;
    let size = 0;
    let crc = 0;
    const chunks = [];
    const settle = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimer(idleTimer);
      clearTimer(totalTimer);
      if (error) reject(error);
      else resolve(value);
    };
    const resetIdle = () => {
      clearTimer(idleTimer);
      idleTimer = setTimer(
        () => settle(new Error('ZIP_ENTRY_IDLE_TIMEOUT')),
        BOUNDED_ZIP_LIMITS.entryIdleTimeoutMs
      );
    };
    totalTimer = setTimer(
      () => settle(new Error('ZIP_ENTRY_DEADLINE')),
      BOUNDED_ZIP_LIMITS.entryDeadlineMs
    );
    zipFile.openReadStream(entry, (error, stream) => {
      if (error) return settle(error);
      resetIdle();
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > BOUNDED_ZIP_LIMITS.uncompressedEntryBytes) {
          stream.destroy(new Error('ZIP_UNCOMPRESSED_LIMIT'));
          return;
        }
        chunks.push(chunk);
        crc = crc32Buffer(chunk, crc);
        resetIdle();
      });
      stream.once('error', (streamError) => settle(streamError));
      stream.once('end', () =>
        settle(null, { bytes: Buffer.concat(chunks, size), crc32: crc >>> 0, size })
      );
    });
  });
}

function collectEntries(zipFile, records, dependencies) {
  return new Promise((resolve, reject) => {
    const results = [];
    let index = 0;
    let totalSize = 0;
    let settled = false;
    const failOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    zipFile.once('error', failOnce);
    zipFile.once('end', () => {
      if (settled) return;
      if (index !== records.length) return failOnce(new Error('ZIP_ENTRY_COUNT_MISMATCH'));
      settled = true;
      resolve(results);
    });
    zipFile.on('entry', (entry) => {
      void (async () => {
        const record = records[index];
        if (!record) fail('ZIP_ENTRY_COUNT_MISMATCH');
        if (
          !entry.fileNameRaw.equals(record.rawName) ||
          entry.generalPurposeBitFlag !== record.flags ||
          entry.compressionMethod !== record.method ||
          entry.compressedSize !== record.compressedSize ||
          entry.uncompressedSize !== record.uncompressedSize ||
          entry.crc32 !== record.crc32 ||
          entry.relativeOffsetOfLocalHeader !== record.localOffset ||
          entry.extraFieldLength !== 0 ||
          entry.fileCommentLength !== 0
        ) {
          fail('ZIP_LIBRARY_STRUCTURE_MISMATCH');
        }
        const content = await readEntryContent(zipFile, entry, dependencies);
        if (content) {
          if (content.size !== record.uncompressedSize) fail('ZIP_UNCOMPRESSED_SIZE_MISMATCH');
          if (content.crc32 !== record.crc32) fail('ZIP_CRC_MISMATCH');
          totalSize += content.size;
          if (totalSize > BOUNDED_ZIP_LIMITS.totalUncompressedBytes) fail('ZIP_TOTAL_LIMIT');
        }
        results.push(
          Object.freeze({
            path: record.path,
            directory: record.directory,
            compressionMethod: record.method,
            compressedSize: record.compressedSize,
            uncompressedSize: record.uncompressedSize,
            crc32: record.crc32,
            content: content?.bytes ?? null
          })
        );
        index += 1;
        zipFile.readEntry();
      })().catch(failOnce);
    });
    zipFile.readEntry();
  });
}

export async function inventoryBoundedZip(archivePath, options = {}, dependencies = {}) {
  const startedAt = Date.now();
  const {
    closeSyncImpl = closeSync,
    fstatSyncImpl = fstatSync,
    lstatSyncImpl = lstatSync
  } = dependencies;
  const openedArchive = openRegularArchive(archivePath, dependencies);
  const { fd } = openedArchive;
  let zipFile;
  try {
    const before = openedArchive.opened;
    if (before.size > BOUNDED_ZIP_LIMITS.archiveBytes) fail('ZIP_ARCHIVE_LIMIT');
    const end = parseEndRecord(fd, before.size);
    const records = parseCentralRecords(fd, end);
    validateNames(records);
    const spans = records
      .map((record) => parseLocalSpan(fd, record))
      .sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const span of spans) {
      if (span.start !== cursor || span.end < span.start) fail('ZIP_HIDDEN_OR_OVERLAPPING_BYTES');
      cursor = span.end;
    }
    if (cursor !== end.centralOffset) fail('ZIP_HIDDEN_OR_OVERLAPPING_BYTES');
    zipFile = await openZipFromFd(fd, before.size, dependencies);
    const entries = await collectEntries(zipFile, records, dependencies);
    const after = fstatSyncImpl(fd);
    const livePath = lstatSyncImpl(archivePath);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mode !== after.mode ||
      before.nlink !== after.nlink ||
      !sameRegularIdentity(after, livePath)
    ) {
      fail('ZIP_ARCHIVE_IDENTITY_CHANGED');
    }
    if (Date.now() - startedAt > BOUNDED_ZIP_LIMITS.inventoryDeadlineMs) {
      fail('ZIP_INVENTORY_DEADLINE');
    }
    if (typeof options.onEntry === 'function') {
      for (const entry of entries) await options.onEntry(entry);
    }
    return Object.freeze({
      archivePath,
      size: before.size,
      entryCount: entries.length,
      entries: Object.freeze(entries)
    });
  } finally {
    if (zipFile) {
      // yauzl's FdSlicer closes a fromFd descriptor when ZipFile.close()
      // releases its final reference. Ownership transfers only after fromFd
      // returns a ZipFile; closing the descriptor here as well causes EBADF.
      await closeZipFile(zipFile, dependencies);
    } else {
      closeSyncImpl(fd);
    }
  }
}

export async function readBoundedZipText(entry) {
  if (entry.directory || !Buffer.isBuffer(entry.content)) return null;
  try {
    return utf8Decoder.decode(entry.content);
  } catch {
    fail('ZIP_ENTRY_UTF8_INVALID', entry.path);
  }
}
