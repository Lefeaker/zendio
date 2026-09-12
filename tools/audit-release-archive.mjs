import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inventoryBoundedZip } from '../scripts/utils/boundedZipArchive.mjs';

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

async function extractZipArchive(archivePath, outputDir) {
  if (!existsSync(archivePath)) {
    throw new Error(`Archive does not exist: ${archivePath}`);
  }

  const inventory = await inventoryBoundedZip(archivePath);
  for (const entry of inventory.entries) {
    if (!entry.content) {
      continue;
    }
    const targetPath = join(outputDir, entry.path);
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
    await extractZipArchive(archivePath, extractedDir);

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[audit-release-archive] Failed to audit release archive.');
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
