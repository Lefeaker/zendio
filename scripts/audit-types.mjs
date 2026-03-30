#!/usr/bin/env node

/**
 * Type safety audit script.
 *
 * Scans TypeScript sources for `any`, `unknown`, type assertions, and
 * non-null assertions. Produces a JSON report under `tmp/types-report.json`
 * and prints a human-readable summary by default.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(__filename), '..');
const repoRoot = resolve(projectRoot, '..');
const defaultJsonPath = resolve(repoRoot, 'tmp', 'types-report.json');

const SOURCE_DIRS = ['src', 'tests'];
const ALLOWED_FORMATS = new Set(['summary', 'json', 'md', 'table']);
const DEFAULT_FORMAT = 'summary';
const IGNORED_DIRECTORIES = new Set([
  'dist',
  'node_modules',
  '.git',
  'tmp',
  'releases',
  'trash'
]);

const args = process.argv.slice(2);
let format = DEFAULT_FORMAT;
let outputPath;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--format') {
    const next = args[i + 1];
    if (!next || !ALLOWED_FORMATS.has(next)) {
      console.error(
        `Unsupported or missing format. Allowed values: ${Array.from(ALLOWED_FORMATS).join(', ')}.`
      );
      process.exitCode = 1;
      process.exit();
    }
    format = next;
    i += 1;
  } else if (arg === '--output') {
    const next = args[i + 1];
    if (!next) {
      console.error('--output requires a path value.');
      process.exitCode = 1;
      process.exit();
    }
    outputPath = resolve(process.cwd(), next);
    i += 1;
  } else {
    console.error(`Unknown argument: ${arg}`);
    process.exitCode = 1;
    process.exit();
  }
}

const METRIC_KEYS = ['any', 'unknown', 'assertions', 'nonNullAssertions', 'tsExpectError'];

function emptyMetrics() {
  return {
    any: 0,
    unknown: 0,
    assertions: 0,
    nonNullAssertions: 0,
    tsExpectError: 0
  };
}

async function collectSourceFiles(dir) {
  const queue = [dir];
  const files = [];

  while (queue.length > 0) {
    const current = queue.pop();
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const entryPath = join(current, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        queue.push(entryPath);
        continue;
      }

      if (isTypeScriptFile(entry.name)) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

function isTypeScriptFile(filename) {
  return (
    filename.endsWith('.ts') ||
    filename.endsWith('.tsx') ||
    filename.endsWith('.mts') ||
    filename.endsWith('.cts')
  );
}

function analyzeSource({ filePath, contents }) {
  const metrics = emptyMetrics();
  const source = ts.createSourceFile(filePath, contents, ts.ScriptTarget.Latest, true);

  const visit = (node) => {
    switch (node.kind) {
      case ts.SyntaxKind.AnyKeyword:
        metrics.any += 1;
        break;
      case ts.SyntaxKind.UnknownKeyword:
        metrics.unknown += 1;
        break;
      default:
        break;
    }

    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      metrics.assertions += 1;
    } else if (ts.isNonNullExpression(node)) {
      metrics.nonNullAssertions += 1;
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  metrics.tsExpectError = countTsExpectErrorComments(contents);
  return metrics;
}

function countTsExpectErrorComments(text) {
  const matches = text.match(/@ts-expect-error/g);
  return matches ? matches.length : 0;
}

function sumMetrics(target, addition) {
  for (const key of METRIC_KEYS) {
    target[key] += addition[key] ?? 0;
  }
}

function buildFileRecord(relPath, metrics) {
  const score =
    metrics.any * 5 +
    metrics.unknown * 3 +
    metrics.assertions * 2 +
    metrics.nonNullAssertions +
    metrics.tsExpectError * 4;

  return {
    path: relPath,
    ...metrics,
    score
  };
}

function formatSummary(report) {
  const lines = [];
  lines.push(`Type safety audit @ ${report.generatedAt}`);
  lines.push(`Scanned files: ${report.totals.files}`);
  lines.push(
    `Totals → any: ${report.totals.any}, unknown: ${report.totals.unknown}, assertions: ${report.totals.assertions}, non-null: ${report.totals.nonNullAssertions}, ts-expect-error: ${report.totals.tsExpectError}`
  );

  const offenders = report.files.filter((file) => file.score > 0).slice(0, 10);
  if (offenders.length > 0) {
    lines.push('Top files:');
    for (const file of offenders) {
      lines.push(
        `  - ${file.path} (any ${file.any}, unknown ${file.unknown}, assertions ${file.assertions}, non-null ${file.nonNullAssertions}, ts-expect-error ${file.tsExpectError})`
      );
    }
  } else {
    lines.push('No type issues detected 🎉');
  }

  return lines.join('\n');
}

function formatMarkdown(report) {
  const header = `# Type Safety Audit\n\n- Generated: ${report.generatedAt}\n- Files scanned: ${report.totals.files}\n- any: ${report.totals.any}\n- unknown: ${report.totals.unknown}\n- assertions: ${report.totals.assertions}\n- non-null assertions: ${report.totals.nonNullAssertions}\n- @ts-expect-error: ${report.totals.tsExpectError}\n\n## Top Files\n\n`;

  const tableHeader =
    '| File | any | unknown | assertions | non-null | @ts-expect-error | Score |\n| --- | --- | --- | --- | --- | --- | --- |\n';

  const rows = report.files
    .filter((file) => file.score > 0)
    .slice(0, 20)
    .map(
      (file) =>
        `| ${file.path} | ${file.any} | ${file.unknown} | ${file.assertions} | ${file.nonNullAssertions} | ${file.tsExpectError} | ${file.score} |`
    );

  return `${header}${rows.length > 0 ? tableHeader + rows.join('\n') : '_No outstanding issues detected._'}\n`;
}

function formatTable(report) {
  const lines = [];
  lines.push(`Type Safety Audit @ ${report.generatedAt}`);
  lines.push(`Files: ${report.totals.files} | any: ${report.totals.any} | unknown: ${report.totals.unknown} | assertions: ${report.totals.assertions} | non-null: ${report.totals.nonNullAssertions} | ts-expect-error: ${report.totals.tsExpectError}`);
  lines.push('');

  const offenders = report.files.filter((file) => file.score > 0).slice(0, 20);
  if (offenders.length > 0) {
    // Calculate column widths
    const maxPathWidth = Math.max(4, ...offenders.map(f => f.path.length));
    const anyWidth = Math.max(3, ...offenders.map(f => f.any.toString().length));
    const unknownWidth = Math.max(7, ...offenders.map(f => f.unknown.toString().length));
    const assertionsWidth = Math.max(10, ...offenders.map(f => f.assertions.toString().length));
    const nonNullWidth = Math.max(8, ...offenders.map(f => f.nonNullAssertions.toString().length));
    const tsExpectWidth = Math.max(11, ...offenders.map(f => f.tsExpectError.toString().length));
    const scoreWidth = Math.max(5, ...offenders.map(f => f.score.toString().length));

    // Header
    const header = `${'File'.padEnd(maxPathWidth)} | ${'any'.padStart(anyWidth)} | ${'unknown'.padStart(unknownWidth)} | ${'assertions'.padStart(assertionsWidth)} | ${'non-null'.padStart(nonNullWidth)} | ${'ts-expect-error'.padStart(tsExpectWidth)} | ${'Score'.padStart(scoreWidth)}`;
    lines.push(header);
    lines.push('-'.repeat(header.length));

    // Data rows
    for (const file of offenders) {
      const row = `${file.path.padEnd(maxPathWidth)} | ${file.any.toString().padStart(anyWidth)} | ${file.unknown.toString().padStart(unknownWidth)} | ${file.assertions.toString().padStart(assertionsWidth)} | ${file.nonNullAssertions.toString().padStart(nonNullWidth)} | ${file.tsExpectError.toString().padStart(tsExpectWidth)} | ${file.score.toString().padStart(scoreWidth)}`;
      lines.push(row);
    }
  } else {
    lines.push('No type issues detected 🎉');
  }

  return lines.join('\n');
}

async function ensureDirectory(filePath) {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
}

async function main() {
  const totals = {
    files: 0,
    ...emptyMetrics()
  };
  const fileRecords = [];

  for (const sourceDir of SOURCE_DIRS) {
    const absoluteDir = join(projectRoot, sourceDir);
    const files = await collectSourceFiles(absoluteDir);
    totals.files += files.length;

    for (const filePath of files) {
      const contents = await readFile(filePath, 'utf8');
      const metrics = analyzeSource({ filePath, contents });
      if (METRIC_KEYS.some((key) => metrics[key] > 0)) {
        const relPath = relative(projectRoot, filePath);
        fileRecords.push(buildFileRecord(relPath, metrics));
      }
      sumMetrics(totals, metrics);
    }
  }

  fileRecords.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const report = {
    project: 'AiiinOB',
    generatedAt: new Date().toISOString(),
    totals,
    files: fileRecords
  };

  await ensureDirectory(defaultJsonPath);
  await writeFile(defaultJsonPath, JSON.stringify(report, null, 2), 'utf8');

  if (outputPath) {
    await ensureDirectory(outputPath);
    const content =
      format === 'md'
        ? formatMarkdown(report)
        : format === 'json'
        ? JSON.stringify(report, null, 2)
        : format === 'table'
        ? formatTable(report)
        : formatSummary(report);
    await writeFile(outputPath, content, 'utf8');
  }

  switch (format) {
    case 'json':
      console.log(JSON.stringify(report, null, 2));
      break;
    case 'md':
      console.log(formatMarkdown(report));
      break;
    case 'table':
      console.log(formatTable(report));
      break;
    default:
      console.log(formatSummary(report));
  }
}

main().catch((error) => {
  console.error('Failed to generate type safety audit:', error);
  process.exitCode = 1;
});
