import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ALLOWLIST_PATH = 'tools/baselines/compatibility-duplicates.json';
const CANDIDATE_SCOPES = [
  {
    directory: 'src/options/components/sections',
    filenamePattern: /^usage.*\.ts$/
  },
  {
    directory: 'src/options/widgets/shared/usage',
    filenamePattern: /^.*\.ts$/
  },
  {
    directory: 'src/options/components/sections',
    filenamePattern: /^restSection.*\.ts$/
  },
  {
    directory: 'src/options/widgets/shared/rest',
    filenamePattern: /^.*\.ts$/
  }
];

function normalizePath(path) {
  return path.split('\\').join('/');
}

function parseArgs(argv) {
  const options = {
    check: false,
    root: process.cwd(),
    allowlistPath: DEFAULT_ALLOWLIST_PATH
  };

  const requirePathValue = (value, flag) => {
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} requires a path.`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') {
      options.check = true;
    } else if (arg === '--root') {
      const next = requirePathValue(argv[index + 1], '--root');
      options.root = resolve(next);
      index += 1;
    } else if (arg === '--allowlist') {
      const next = requirePathValue(argv[index + 1], '--allowlist');
      options.allowlistPath = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function collectCandidateFiles(root) {
  const files = new Set();

  for (const { directory, filenamePattern } of CANDIDATE_SCOPES) {
    const fullDirectory = join(root, directory);
    if (!existsSync(fullDirectory)) {
      continue;
    }

    for (const entry of readdirSync(fullDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !filenamePattern.test(entry.name)) {
        continue;
      }
      files.add(normalizePath(relative(root, join(fullDirectory, entry.name))));
    }
  }

  return Array.from(files).sort();
}

function hashFile(root, relativePath) {
  return createHash('sha256').update(readFileSync(join(root, relativePath))).digest('hex');
}

export function findDuplicateGroups(root = process.cwd()) {
  const candidateFiles = collectCandidateFiles(root);
  const groupsByHash = new Map();

  for (const file of candidateFiles) {
    const hash = hashFile(root, file);
    if (!groupsByHash.has(hash)) {
      groupsByHash.set(hash, []);
    }
    groupsByHash.get(hash).push(file);
  }

  const duplicateGroups = Array.from(groupsByHash.values())
    .filter((files) => files.length > 1)
    .map((files) => files.sort())
    .sort((a, b) => a[0].localeCompare(b[0]));

  return {
    candidateFiles,
    duplicateGroups
  };
}

function groupKey(files) {
  return [...files].sort().join('\n');
}

function resolveAllowlistPath(root, allowlistPath) {
  return resolve(root, allowlistPath);
}

export function loadAllowlist(root = process.cwd(), allowlistPath = DEFAULT_ALLOWLIST_PATH) {
  const fullPath = resolveAllowlistPath(root, allowlistPath);
  if (!existsSync(fullPath)) {
    return [];
  }

  const parsed = JSON.parse(readFileSync(fullPath, 'utf8'));
  const entries = Array.isArray(parsed) ? parsed : parsed.groups;
  if (!Array.isArray(entries)) {
    throw new Error('compatibility duplicate allowlist must be an array or { "groups": [...] }.');
  }

  return entries.map((entry) => {
    if (!Array.isArray(entry.files) || entry.files.length < 2) {
      throw new Error('each compatibility duplicate allowlist entry requires at least two files.');
    }
    return {
      ...entry,
      files: entry.files.map(normalizePath).sort()
    };
  });
}

export function evaluateDuplicateGroups(duplicateGroups, allowlist) {
  const allowedKeys = new Map(allowlist.map((entry) => [groupKey(entry.files), entry]));
  const unexpected = duplicateGroups.filter((files) => !allowedKeys.has(groupKey(files)));
  const allowed = duplicateGroups.filter((files) => allowedKeys.has(groupKey(files)));
  const presentKeys = new Set(duplicateGroups.map(groupKey));
  const staleAllowlist = allowlist.filter((entry) => !presentKeys.has(groupKey(entry.files)));

  return {
    ok: unexpected.length === 0 && staleAllowlist.length === 0,
    allowed,
    unexpected,
    staleAllowlist
  };
}

function printReport({ candidateFiles, duplicateGroups, allowlist, evaluation }) {
  console.log('Compatibility duplicate audit');
  console.log(`candidate files: ${candidateFiles.length}`);
  console.log(`duplicate groups: ${duplicateGroups.length}`);
  console.log(`allowlist entries: ${allowlist.length}`);
  console.log(`unexpected duplicate groups: ${evaluation.unexpected.length}`);
  console.log(`allowed duplicate groups: ${evaluation.allowed.length}`);
  console.log(`stale allowlist entries: ${evaluation.staleAllowlist.length}`);

  if (duplicateGroups.length === 0) {
    console.log('No exact duplicate compatibility groups found.');
  }

  for (const files of duplicateGroups) {
    const allowed = !evaluation.unexpected.some((unexpected) => groupKey(unexpected) === groupKey(files));
    console.log(`\n${allowed ? 'allowed' : 'unexpected'} duplicate group:`);
    for (const file of files) {
      console.log(`- ${file}`);
    }
  }

  if (evaluation.staleAllowlist.length > 0) {
    console.log('\nStale allowlist entries:');
    for (const entry of evaluation.staleAllowlist) {
      console.log(`- ${entry.files.join(', ')}`);
    }
  }
}

export async function runCompatibilityDuplicateAudit(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const root = resolve(options.root);
  const report = findDuplicateGroups(root);
  const allowlist = loadAllowlist(root, options.allowlistPath);
  const evaluation = evaluateDuplicateGroups(report.duplicateGroups, allowlist);

  printReport({
    ...report,
    allowlist,
    evaluation
  });

  if (options.check && !evaluation.ok) {
    if (evaluation.unexpected.length > 0) {
      console.error(
        `Unexpected compatibility duplicate groups found: ${evaluation.unexpected.length}. Add an allowlist entry only with owner-approved deleteGate evidence.`
      );
    }
    if (evaluation.staleAllowlist.length > 0) {
      console.error(
        `Stale compatibility duplicate allowlist entries found: ${evaluation.staleAllowlist.length}. Remove entries after duplicate groups disappear.`
      );
    }
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (executedPath === fileURLToPath(import.meta.url)) {
  runCompatibilityDuplicateAudit().catch((error) => {
    console.error('Failed to audit compatibility duplicates:', error.message ?? error);
    process.exitCode = 1;
  });
}
