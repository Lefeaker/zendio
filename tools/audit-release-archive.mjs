import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(args) {
  const archives = [];
  let keepTemp = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--archive') {
      const archivePath = args[index + 1];
      if (!archivePath || archivePath.startsWith('--')) {
        throw new Error('Missing value for --archive');
      }
      archives.push(resolve(archivePath));
      index += 1;
    } else if (arg === '--keep-temp') {
      keepTemp = true;
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  if (archives.length === 0) {
    throw new Error('At least one --archive <zip-or-xpi> value is required.');
  }

  return { archives, keepTemp };
}

function normalizeArchivePath(entryPath) {
  const normalizedPath = entryPath.replaceAll('\\', '/');
  if (
    normalizedPath.startsWith('/')
    || /^[a-zA-Z]:/.test(normalizedPath)
    || normalizedPath.includes('\0')
  ) {
    throw new Error(`Unsafe absolute archive entry path: ${entryPath}`);
  }

  const safePath = normalize(normalizedPath);
  if (safePath === '..' || safePath.startsWith(`..${sep}`)) {
    throw new Error(`Unsafe parent-traversal archive entry path: ${entryPath}`);
  }

  return safePath;
}

function readZipEntryContent(
  buffer,
  { archivePath, compressedSize, compressionMethod, localHeaderOffset, path }
) {
  if (path.endsWith('/')) {
    return null;
  }
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error(`Invalid ZIP local file header for ${path} in ${archivePath}`);
  }
  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const contentStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(contentStart, contentStart + compressedSize);
  if (compressionMethod === 0) {
    return compressed;
  }
  if (compressionMethod === 8) {
    return inflateRawSync(compressed);
  }
  throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${path}`);
}

function parseZipEntries(archivePath) {
  const buffer = readFileSync(archivePath);
  let endOffset = -1;
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      endOffset = index;
      break;
    }
  }

  if (endOffset === -1) {
    throw new Error(`Unable to locate ZIP end-of-central-directory record: ${archivePath}`);
  }

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  const entries = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory entry in ${archivePath}`);
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const path = buffer.subarray(fileNameStart, fileNameEnd).toString('utf8');
    entries.push({
      path,
      content: readZipEntryContent(buffer, {
        archivePath,
        compressedSize,
        compressionMethod,
        localHeaderOffset,
        path
      })
    });
    offset = fileNameEnd + extraLength + commentLength;
  }

  return entries;
}

function extractZipArchive(archivePath, outputDir) {
  if (!existsSync(archivePath)) {
    throw new Error(`Archive does not exist: ${archivePath}`);
  }

  for (const entry of parseZipEntries(archivePath)) {
    if (!entry.content) {
      continue;
    }
    const targetPath = join(outputDir, normalizeArchivePath(entry.path));
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, entry.content);
  }
}

export async function auditReleaseArchive(archivePath, options = {}) {
  const { keepTemp = false, logger = console } = options;
  const tempRoot = mkdtempSync(join(tmpdir(), 'aiiinob-release-archive-'));
  const extractedDir = join(tempRoot, 'dist');

  try {
    mkdirSync(extractedDir, { recursive: true });
    extractZipArchive(archivePath, extractedDir);

    const result = spawnSync(
      process.execPath,
      [join(repoRoot, 'tools/report-release-surface.mjs'), '--dist', extractedDir],
      {
        cwd: repoRoot,
        encoding: 'utf8'
      }
    );

    if (result.stdout) {
      logger.log(result.stdout.trimEnd());
    }
    if (result.stderr) {
      logger.error(result.stderr.trimEnd());
    }
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`release surface audit failed for extracted archive: ${archivePath}`);
    }

    logger.log(`Audited extracted archive: ${archivePath} -> ${extractedDir}`);
  } finally {
    if (!keepTemp) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

async function main() {
  const { archives, keepTemp } = parseArgs(process.argv.slice(2));
  for (const archive of archives) {
    await auditReleaseArchive(archive, { keepTemp });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[audit-release-archive] Failed to audit release archive.');
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
