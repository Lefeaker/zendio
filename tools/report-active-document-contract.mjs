import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MANIFEST_PATH = 'tools/active-document-status.json';
const SCHEMA_VERSION = 1;
const DOCUMENT_STATUSES = Object.freeze(['active', 'historical', 'fixture']);
const DOCUMENT_STATUS_SET = new Set(DOCUMENT_STATUSES);

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(compareCodeUnits);
  const wanted = [...expected].sort(compareCodeUnits);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validDocumentPath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\0') &&
    !value.includes('\\') &&
    !value.startsWith('/') &&
    !value.startsWith('./') &&
    value !== '..' &&
    !value.startsWith('../') &&
    posix.normalize(value) === value &&
    value.endsWith('.md')
  );
}

function finding(code, message, { path, rowIndex } = {}) {
  return {
    code,
    ...(path === undefined ? {} : { path }),
    ...(rowIndex === undefined ? {} : { rowIndex }),
    message
  };
}

function sortFindings(findings) {
  return findings.sort((left, right) => {
    const codeOrder = compareCodeUnits(left.code, right.code);
    if (codeOrder !== 0) return codeOrder;
    const pathOrder = compareCodeUnits(left.path ?? '', right.path ?? '');
    if (pathOrder !== 0) return pathOrder;
    const rowOrder = (left.rowIndex ?? -1) - (right.rowIndex ?? -1);
    if (rowOrder !== 0) return rowOrder;
    return compareCodeUnits(left.message, right.message);
  });
}

function listTrackedMarkdown(repoRoot) {
  const result = spawnSync('git', ['-C', repoRoot, 'ls-files', '--stage', '-z', '--', '*.md'], {
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message ||
      Buffer.from(result.stderr ?? '')
        .toString('utf8')
        .trim();
    throw new Error(`git ls-files failed${detail ? `: ${detail}` : ''}`);
  }

  const entries = Buffer.from(result.stdout ?? '')
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf('\t');
      if (tab < 0) throw new Error('git ls-files returned an invalid stage row');
      const [mode, , stage] = entry.slice(0, tab).split(' ');
      return { mode, path: entry.slice(tab + 1), stage };
    })
    .sort((left, right) => compareCodeUnits(left.path, right.path));

  return entries;
}

function readManifest(repoRoot, manifestPath) {
  return JSON.parse(readFileSync(resolve(repoRoot, manifestPath), 'utf8'));
}

function auditActiveDocumentContract({
  repoRoot = process.cwd(),
  manifestPath = MANIFEST_PATH
} = {}) {
  const findings = [];
  let trackedEntries = [];
  try {
    trackedEntries = listTrackedMarkdown(repoRoot);
  } catch (error) {
    findings.push(
      finding('git-inventory-failed', String(error instanceof Error ? error.message : error))
    );
  }

  const trackedModes = new Map();
  for (const entry of trackedEntries) {
    const modes = trackedModes.get(entry.path) ?? new Set();
    modes.add(`${entry.mode}:${entry.stage}`);
    trackedModes.set(entry.path, modes);
  }
  const trackedPaths = [...trackedModes.keys()].sort(compareCodeUnits);
  for (const [path, modes] of trackedModes) {
    if ([...modes].some((mode) => mode.startsWith('120000:'))) {
      findings.push(
        finding('tracked-markdown-symlink', 'tracked Markdown must be an ordinary file', { path })
      );
    }
    if (modes.size !== 1 || !modes.has('100644:0')) {
      const ordinaryExecutable = modes.size === 1 && modes.has('100755:0');
      const symlinkOnly = modes.size === 1 && modes.has('120000:0');
      if (!ordinaryExecutable && !symlinkOnly) {
        findings.push(
          finding(
            'tracked-markdown-stage-invalid',
            'tracked Markdown has a nonzero or conflicting index stage',
            {
              path
            }
          )
        );
      }
    }
  }

  let manifest;
  try {
    manifest = readManifest(repoRoot, manifestPath);
  } catch (error) {
    findings.push(
      finding(
        'manifest-read-failed',
        `unable to read ${manifestPath}: ${String(error instanceof Error ? error.message : error)}`
      )
    );
  }

  const validRows = [];
  if (manifest !== undefined) {
    if (!exactKeys(manifest, ['schemaVersion', 'documents'])) {
      findings.push(
        finding(
          'manifest-schema-invalid',
          'manifest keys must be exactly schemaVersion and documents'
        )
      );
    }
    if (manifest?.schemaVersion !== SCHEMA_VERSION) {
      findings.push(
        finding('manifest-version-invalid', `schemaVersion must be the number ${SCHEMA_VERSION}`)
      );
    }
    if (!Array.isArray(manifest?.documents)) {
      findings.push(finding('manifest-documents-invalid', 'documents must be an array'));
    } else {
      manifest.documents.forEach((row, rowIndex) => {
        const rowPath = typeof row?.path === 'string' ? row.path : undefined;
        if (!exactKeys(row, ['path', 'status'])) {
          findings.push(
            finding(
              'document-row-schema-invalid',
              'document row keys must be exactly path and status',
              {
                path: rowPath,
                rowIndex
              }
            )
          );
        }
        const pathValid = validDocumentPath(row?.path);
        if (!pathValid) {
          findings.push(
            finding(
              'document-path-invalid',
              'path must be a normalized repository-relative Markdown path',
              {
                path: rowPath,
                rowIndex
              }
            )
          );
        }
        const statusValid = DOCUMENT_STATUS_SET.has(row?.status);
        if (!statusValid) {
          findings.push(
            finding('document-status-invalid', 'status must be active, historical, or fixture', {
              path: rowPath,
              rowIndex
            })
          );
        }
        if (pathValid && statusValid)
          validRows.push({ path: row.path, status: row.status, rowIndex });
      });
    }
  }

  const manifestPaths = validRows.map((row) => row.path);
  const duplicatePaths = new Set();
  const seenPaths = new Set();
  for (const path of manifestPaths) {
    if (seenPaths.has(path)) duplicatePaths.add(path);
    seenPaths.add(path);
  }
  for (const path of [...duplicatePaths].sort(compareCodeUnits)) {
    findings.push(finding('document-path-duplicate', 'document paths must be unique', { path }));
  }
  if (
    manifestPaths.some(
      (path, index) => index > 0 && compareCodeUnits(manifestPaths[index - 1], path) >= 0
    )
  ) {
    findings.push(
      finding(
        'documents-unsorted',
        'document rows must be sorted and unique by path code-unit order'
      )
    );
  }

  const trackedSet = new Set(trackedPaths);
  const manifestSet = new Set(manifestPaths);
  for (const path of trackedPaths) {
    if (!manifestSet.has(path)) {
      findings.push(
        finding('tracked-markdown-unclassified', 'tracked Markdown is missing from the manifest', {
          path
        })
      );
    }
  }
  for (const path of [...manifestSet].sort(compareCodeUnits)) {
    if (!trackedSet.has(path)) {
      findings.push(
        finding('manifest-path-stale', 'manifest path is not current tracked Markdown', { path })
      );
    }
  }

  const statusByPath = new Map();
  for (const row of validRows) {
    if (!statusByPath.has(row.path)) statusByPath.set(row.path, row.status);
  }
  const counts = {
    trackedMarkdown: trackedPaths.length,
    classifiedDocuments: statusByPath.size,
    active: [...statusByPath.values()].filter((status) => status === 'active').length,
    historical: [...statusByPath.values()].filter((status) => status === 'historical').length,
    fixture: [...statusByPath.values()].filter((status) => status === 'fixture').length
  };

  sortFindings(findings);
  return {
    schemaVersion: SCHEMA_VERSION,
    manifestPath,
    counts,
    findings,
    ok: findings.length === 0
  };
}

function parseActiveDocumentContractArgs(argv) {
  if (argv.length !== 1 || !['--report', '--check'].includes(argv[0])) {
    throw new Error('expected exactly one mode: --report or --check');
  }
  return argv[0] === '--report' ? 'report' : 'check';
}

function runActiveDocumentContractCli(
  argv = process.argv.slice(2),
  { repoRoot = process.cwd() } = {}
) {
  let mode;
  try {
    mode = parseActiveDocumentContractArgs(argv);
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    return 2;
  }

  const report = auditActiveDocumentContract({ repoRoot });
  console.log(JSON.stringify(report, null, 2));
  return mode === 'check' && !report.ok ? 1 : 0;
}

export {
  DOCUMENT_STATUSES,
  MANIFEST_PATH,
  SCHEMA_VERSION,
  auditActiveDocumentContract,
  listTrackedMarkdown,
  parseActiveDocumentContractArgs,
  runActiveDocumentContractCli
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runActiveDocumentContractCli();
}
