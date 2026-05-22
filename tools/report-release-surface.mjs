import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

const REPORT_PATH = 'build/reports/release-surface.json';
const DEFAULT_DIST_DIR = 'build/dist';
const FORBIDDEN_HARNESS_BASENAMES = [
  'interaction-contract-harness',
  'content-orchestrator-harness',
  'runtime-observability-harness',
  'local-vault-write-harness'
];
const FORBIDDEN_HARNESS_RE = new RegExp(
  `(^|/)(${FORBIDDEN_HARNESS_BASENAMES.join('|')})\\.(html|js)$`
);

function parseArgs(args) {
  const parsed = {
    distDir: DEFAULT_DIST_DIR,
    archives: [],
    writeJson: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dist') {
      parsed.distDir = args[index + 1];
      index += 1;
    } else if (arg === '--archive') {
      parsed.archives.push(args[index + 1]);
      index += 1;
    } else if (arg === '--json') {
      parsed.writeJson = true;
    } else if (arg === '--check') {
      parsed.check = true;
    }
  }

  return parsed;
}

function normalizeManifestPath(path) {
  return path.replaceAll('\\', '/').replace(/^\/+/, '');
}

function listFiles(root) {
  if (!existsSync(root)) {
    return [];
  }

  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      const absolute = join(directory, entry);
      const stats = statSync(absolute);
      if (stats.isDirectory()) {
        visit(absolute);
      } else if (stats.isFile()) {
        files.push(relative(root, absolute).replaceAll('\\', '/'));
      }
    }
  };
  visit(root);
  return files.sort();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectIconReferences(value, source) {
  if (!value) {
    return [];
  }
  if (typeof value === 'string') {
    return [{ source, path: normalizeManifestPath(value) }];
  }
  if (typeof value === 'object') {
    return Object.values(value)
      .filter((entry) => typeof entry === 'string')
      .map((entry) => ({ source, path: normalizeManifestPath(entry) }));
  }
  return [];
}

function collectManifestReferences(manifest) {
  const references = [];
  const add = (source, path) => {
    if (typeof path === 'string' && path.length > 0) {
      references.push({ source, path: normalizeManifestPath(path) });
    }
  };

  add('background.service_worker', manifest.background?.service_worker);
  add('action.default_popup', manifest.action?.default_popup);
  add('options_ui.page', manifest.options_ui?.page);

  references.push(...collectIconReferences(manifest.icons, 'icons'));
  references.push(...collectIconReferences(manifest.action?.default_icon, 'action.default_icon'));

  for (const [index, script] of toArray(manifest.content_scripts).entries()) {
    for (const path of toArray(script.js)) {
      add(`content_scripts[${index}].js`, path);
    }
    for (const path of toArray(script.css)) {
      add(`content_scripts[${index}].css`, path);
    }
  }

  for (const [index, document] of toArray(manifest.offscreen_documents).entries()) {
    add(`offscreen_documents[${index}].page`, document.page);
  }

  for (const [index, resourceGroup] of toArray(manifest.web_accessible_resources).entries()) {
    for (const path of toArray(resourceGroup.resources)) {
      add(`web_accessible_resources[${index}].resources`, path);
    }
  }

  if (typeof manifest.default_locale === 'string' && manifest.default_locale.length > 0) {
    add('default_locale', `_locales/${manifest.default_locale}/messages.json`);
  }

  return references;
}

function globToRegExp(pattern) {
  const escaped = normalizeManifestPath(pattern)
    .split('*')
    .map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${escaped}$`);
}

function resolveReference(reference, files, distDir) {
  if (reference.path.includes('*')) {
    const matcher = globToRegExp(reference.path);
    const matches = files.filter((file) => matcher.test(file));
    return {
      ...reference,
      ok: matches.length > 0,
      matches
    };
  }

  return {
    ...reference,
    ok: existsSync(join(distDir, reference.path)),
    matches: existsSync(join(distDir, reference.path)) ? [reference.path] : []
  };
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
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    entries.push(buffer.subarray(fileNameStart, fileNameEnd).toString('utf8'));
    offset = fileNameEnd + extraLength + commentLength;
  }

  return entries;
}

function buildReport({ distDir, archives }) {
  const failures = [];
  if (!existsSync(distDir)) {
    return {
      version: 1,
      distDir,
      files: [],
      manifestReferences: [],
      archives: [],
      failures: [`dist directory does not exist: ${distDir}`]
    };
  }

  const manifestPath = join(distDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return {
      version: 1,
      distDir,
      files: [],
      manifestReferences: [],
      archives: [],
      failures: [`manifest is missing: ${manifestPath}`]
    };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const files = listFiles(distDir);
  const manifestReferences = collectManifestReferences(manifest).map((reference) =>
    resolveReference(reference, files, distDir)
  );
  const missingReferences = manifestReferences.filter((reference) => !reference.ok);
  const forbiddenDistFiles = files.filter((file) => FORBIDDEN_HARNESS_RE.test(file));

  failures.push(
    ...missingReferences.map(
      (reference) => `missing manifest reference: ${reference.source} -> ${reference.path}`
    ),
    ...forbiddenDistFiles.map((file) => `forbidden harness member in build/dist: ${file}`)
  );

  const archiveReports = archives.map((archivePath) => {
    const entries = parseZipEntries(archivePath).map(normalizeManifestPath);
    const forbiddenEntries = entries.filter((entry) => FORBIDDEN_HARNESS_RE.test(entry));
    failures.push(
      ...forbiddenEntries.map((entry) => `forbidden harness member in archive ${archivePath}: ${entry}`)
    );
    return {
      path: archivePath,
      entryCount: entries.length,
      forbiddenEntries
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    distDir,
    fileCount: files.length,
    forbiddenDistFiles,
    manifestReferences,
    archives: archiveReports,
    failures
  };
}

function formatReport(report) {
  const lines = [
    '# Release Surface Report',
    '',
    `Dist: ${report.distDir}`,
    `Files: ${report.fileCount ?? 0}`,
    '',
    '## Manifest References',
    '',
    '| Source | Path | Status |',
    '| --- | --- | --- |'
  ];

  for (const reference of report.manifestReferences ?? []) {
    lines.push(`| ${reference.source} | \`${reference.path}\` | ${reference.ok ? 'ok' : 'missing'} |`);
  }

  lines.push('', '## Forbidden Harness Members', '');
  if (report.forbiddenDistFiles?.length) {
    for (const file of report.forbiddenDistFiles) {
      lines.push(`- build/dist: \`${file}\``);
    }
  } else {
    lines.push('- build/dist: none');
  }

  for (const archive of report.archives ?? []) {
    if (archive.forbiddenEntries.length) {
      for (const entry of archive.forbiddenEntries) {
        lines.push(`- ${archive.path}: \`${entry}\``);
      }
    } else {
      lines.push(`- ${archive.path}: none`);
    }
  }

  if (report.failures.length) {
    lines.push('', '## Failures', '', ...report.failures.map((failure) => `- ${failure}`));
  }

  return `${lines.join('\n')}\n`;
}

const options = parseArgs(process.argv.slice(2));
const report = buildReport(options);
console.log(formatReport(report));

if (options.writeJson) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

if (report.failures.length > 0) {
  process.exit(1);
}
