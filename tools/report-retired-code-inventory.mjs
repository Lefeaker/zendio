import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';

const ROOT = process.cwd();
const INVENTORY_PATH = 'docs/retired-code-inventory.md';
const SCAN_ROOTS = ['package.json', 'scripts', 'src', 'tests', 'public'];

function parseArgs(args) {
  const parsed = { enforceDeleteNow: args.includes('--enforce-delete-now') };
  const writeIndex = args.indexOf('--write-build-graph');
  if (writeIndex !== -1) {
    parsed.writeBuildGraph = args[writeIndex + 1];
  }
  return parsed;
}

function readInventoryRows(source = readFileSync(INVENTORY_PATH, 'utf8')) {
  return source
    .split('\n')
    .filter((line) => line.startsWith('|') && line.includes('`src/'))
    .map((line) => {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      return {
        pathFamily: cells[0]?.match(/`([^`]+)`/)?.[1] ?? '',
        decision: cells[1] ?? '',
        runtimeOwner: cells[2] ?? '',
        verificationOwner: cells[3] ?? ''
      };
    })
    .filter((row) => row.pathFamily);
}

async function walk(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function readTextFiles() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    const fullRoot = join(ROOT, root);
    if (!existsSync(fullRoot)) {
      continue;
    }
    const stats = await stat(fullRoot);
    const candidates = stats.isDirectory() ? await walk(fullRoot) : [fullRoot];
    for (const file of candidates) {
      if (/\.(ts|tsx|js|mjs|cjs|json|html|md)$/.test(file)) {
        files.push({ path: relative(ROOT, file), source: await readFile(file, 'utf8') });
      }
    }
  }
  return files;
}

function familyTokens(pathFamily) {
  const base = pathFamily
    .replace('/**', '')
    .replace('/*Section.ts', '')
    .replace('*', '')
    .replace('.ts', '');
  return Array.from(new Set([base, base.replace(/^src\//, '')]));
}

function pathExistsForFamily(pathFamily) {
  if (pathFamily.endsWith('/**')) {
    return existsSync(pathFamily.slice(0, -3));
  }
  if (pathFamily.includes('*')) {
    const prefix = pathFamily.slice(0, pathFamily.indexOf('*'));
    return existsSync(prefix) || existsSync(dirname(prefix));
  }
  if (pathFamily.endsWith('/*Section.ts')) {
    return existsSync('src/options/components/sections');
  }
  return existsSync(pathFamily);
}

function findOwners(files, pathFamily) {
  const tokens = familyTokens(pathFamily);
  return files
    .filter((file) => file.path !== INVENTORY_PATH)
    .filter((file) => tokens.some((token) => file.source.includes(token)))
    .map((file) => file.path);
}

function maybeWriteBuildGraph(outputPath) {
  if (!outputPath) {
    return;
  }
  const result = spawnSync('npm', ['run', 'audit:build-graph:report'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        command: 'npm run audit:build-graph:report',
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  if (result.status !== 0) {
    throw new Error(`audit:build-graph:report failed while writing ${outputPath}`);
  }
}

export async function buildRetiredCodeInventoryReport(args = {}) {
  const rows = readInventoryRows(args.inventorySource);
  const files = await readTextFiles();
  const findings = rows.map((row) => ({
    ...row,
    exists: pathExistsForFamily(row.pathFamily),
    owners: findOwners(files, row.pathFamily)
  }));
  return {
    rows: findings,
    failures: findings
      .filter((row) => row.decision === 'delete-now')
      .filter((row) => args.enforceDeleteNow && (row.exists || row.owners.length > 0))
      .map((row) => `delete-now path still exists or has owners: ${row.pathFamily}`)
  };
}

function printReport(report) {
  console.log('Retired code inventory report');
  for (const row of report.rows) {
    console.log(
      [
        row.pathFamily,
        `decision=${row.decision}`,
        `exists=${row.exists}`,
        `owners=${row.owners.length}`
      ].join(' | ')
    );
    if (row.owners.length) {
      console.log(`  owners: ${row.owners.join(', ')}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  maybeWriteBuildGraph(args.writeBuildGraph);
  const report = await buildRetiredCodeInventoryReport(args);
  printReport(report);
  if (report.failures.length > 0) {
    console.error(report.failures.join('\n'));
    process.exit(1);
  }
}

await main();
