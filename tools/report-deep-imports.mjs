import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const deepImportPathPattern = String.raw`((?:\.\.\/){3,}[^'"]*)`;
const importExportPattern = new RegExp(
  String.raw`\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s*)?['"]${deepImportPathPattern}['"]`,
  'g'
);
const dynamicImportPattern = new RegExp(
  String.raw`\bimport\s*\(\s*['"]${deepImportPathPattern}['"]\s*\)`,
  'g'
);

const projectAllowlist = [];

function lineForIndex(source, index) {
  return source.slice(0, index).split('\n').length;
}

function collectMatches(file, source, pattern, kind) {
  return Array.from(source.matchAll(pattern), (match) => ({
    file,
    line: lineForIndex(source, match.index ?? 0),
    importPath: match[1],
    kind
  }));
}

function isSourceFile(path) {
  return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function isAllowlisted(finding, allowlist) {
  return allowlist.some((entry) => {
    return (
      entry.file === finding.file &&
      entry.importPath === finding.importPath &&
      Boolean(entry.reason) &&
      Boolean(entry.expiresWhen)
    );
  });
}

export function collectDeepImportFindings(files) {
  return files
    .flatMap((file) => [
      ...collectMatches(file.file, file.source, importExportPattern, 'static-or-reexport'),
      ...collectMatches(file.file, file.source, dynamicImportPattern, 'dynamic')
    ])
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function formatDeepImportFindings(findings) {
  if (findings.length === 0) {
    return 'No deep relative imports found.';
  }
  return findings
    .map((finding) => `${finding.file}:${finding.line} ${finding.importPath}`)
    .join('\n');
}

export function hasBlockingDeepImports(findings, allowlist = []) {
  return findings.some((finding) => !isAllowlisted(finding, allowlist));
}

async function collectSourceFilePaths(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFilePaths(fullPath)));
      continue;
    }
    if (entry.isFile() && isSourceFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function loadSourceFiles(root) {
  const targetDir = join(root, 'src');
  const paths = await collectSourceFilePaths(targetDir);
  return Promise.all(
    paths.map(async (path) => ({
      file: relative(root, path),
      source: await readFile(path, 'utf8')
    }))
  );
}

async function main() {
  const root = process.cwd();
  const checkMode = process.argv.includes('--check');
  const files = await loadSourceFiles(root);
  const findings = collectDeepImportFindings(files);
  const output = formatDeepImportFindings(findings);
  console.log(output);

  if (checkMode && hasBlockingDeepImports(findings, projectAllowlist)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
