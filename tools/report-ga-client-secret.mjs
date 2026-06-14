import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const DEFAULT_SOURCE_DIR = 'src';
const DEFAULT_DIST_DIR = 'build/dist';
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.html', '.css']);

export const CLIENT_SECRET_PATTERNS = Object.freeze([
  {
    label: 'google endpoint',
    regex:
      /https?:\/\/www\.google-analytics\.com\/(?:debug\/mp\/collect|mp\/collect)|google-analytics\.com\/(?:debug\/mp\/collect|mp\/collect)/gi
  },
  {
    label: 'secret-like GA token',
    regex:
      /\b(?:api_secret|apiSecret|API_SECRET|GA4_API_SECRET|AIIINOB_GA_API_SECRET|ZENDIO_GA_API_SECRET|AIIINOB_GA_SECRET|ZENDIO_GA_SECRET)\b/g
  },
  {
    label: 'owner debug proxy secret token',
    regex: /\b(?:debugProxySecret|ownerDebugProxySecret|proxySecret|proxy_secret)\b/gi
  }
]);

function parseArgs(args) {
  const parsed = {
    sourceDir: DEFAULT_SOURCE_DIR,
    distDir: DEFAULT_DIST_DIR,
    archives: [],
    check: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--source') {
      parsed.sourceDir = args[index + 1] ?? DEFAULT_SOURCE_DIR;
      index += 1;
    } else if (arg === '--dist') {
      parsed.distDir = args[index + 1] ?? DEFAULT_DIST_DIR;
      index += 1;
    } else if (arg === '--archive') {
      const archivePath = args[index + 1];
      if (!archivePath || archivePath.startsWith('--')) {
        throw new Error('Missing value for --archive');
      }
      parsed.archives.push(archivePath);
      index += 1;
    } else if (arg === '--check') {
      parsed.check = true;
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  return parsed;
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

function shouldScanContent(filePath) {
  return !filePath.endsWith('.map') && TEXT_EXTENSIONS.has(extname(filePath));
}

function findLineAndColumn(source, index) {
  let line = 1;
  let column = 1;

  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

function lineAt(source, line) {
  return source.split('\n')[line - 1]?.trim() ?? '';
}

export function scanTextWithPatterns(scope, filePath, contents, patterns) {
  const findings = [];

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    for (const match of contents.matchAll(pattern.regex)) {
      const index = match.index ?? 0;
      const { line, column } = findLineAndColumn(contents, index);
      findings.push({
        scope,
        path: filePath,
        label: pattern.label,
        match: match[0],
        line,
        column,
        snippet: lineAt(contents, line)
      });
    }
  }

  return findings;
}

export function scanDirectoryWithPatterns(root, scope, patterns) {
  if (!existsSync(root)) {
    return {
      scope,
      root,
      filesScanned: 0,
      findings: [],
      failures: [`missing directory for ${scope}: ${root}`]
    };
  }

  const findings = [];
  let filesScanned = 0;

  for (const relativePath of listFiles(root)) {
    if (!shouldScanContent(relativePath)) {
      continue;
    }

    filesScanned += 1;
    const absolutePath = join(root, relativePath);
    const contents = readFileSync(absolutePath, 'utf8');
    findings.push(...scanTextWithPatterns(scope, relativePath, contents, patterns));
  }

  return {
    scope,
    root,
    filesScanned,
    findings,
    failures: []
  };
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
    return compressed.toString('utf8');
  }
  if (compressionMethod === 8) {
    return inflateRawSync(compressed).toString('utf8');
  }
  return null;
}

export function parseZipEntries(archivePath) {
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
    const path = buffer.subarray(fileNameStart, fileNameEnd).toString('utf8').replaceAll('\\', '/');
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

export function scanArchiveWithPatterns(archivePath, patterns, scope = basename(archivePath)) {
  if (!existsSync(archivePath)) {
    return {
      scope,
      archivePath,
      entryCount: 0,
      findings: [],
      failures: [`missing archive for ${scope}: ${archivePath}`]
    };
  }

  const findings = [];
  const entries = parseZipEntries(archivePath);

  for (const entry of entries) {
    if (typeof entry.content !== 'string' || !shouldScanContent(entry.path)) {
      continue;
    }

    findings.push(...scanTextWithPatterns(scope, entry.path, entry.content, patterns));
  }

  return {
    scope,
    archivePath,
    entryCount: entries.length,
    findings,
    failures: []
  };
}

export function buildClientSecretReport({
  sourceDir = DEFAULT_SOURCE_DIR,
  distDir = DEFAULT_DIST_DIR,
  archives = []
} = {}) {
  const normalizedArchives = archives.map((archivePath) => resolve(archivePath));
  const source = scanDirectoryWithPatterns(resolve(sourceDir), 'source', CLIENT_SECRET_PATTERNS);
  const dist = scanDirectoryWithPatterns(resolve(distDir), 'build/dist', CLIENT_SECRET_PATTERNS);
  const archiveReports = normalizedArchives.map((archivePath) =>
    scanArchiveWithPatterns(archivePath, CLIENT_SECRET_PATTERNS)
  );

  const failures = [
    ...source.failures,
    ...dist.failures,
    ...archiveReports.flatMap((archive) => archive.failures)
  ];

  return {
    version: 1,
    source,
    dist,
    archives: archiveReports,
    failures
  };
}

function formatFinding(finding) {
  return `- ${finding.scope} ${finding.path}:${finding.line}:${finding.column} ${finding.label} (${finding.match})\n  ${finding.snippet}`;
}

function formatReport(report) {
  const lines = [
    '# GA Client Secret Report',
    '',
    `Source dir: ${report.source.root}`,
    `Source files scanned: ${report.source.filesScanned}`,
    `Dist dir: ${report.dist.root}`,
    `Dist files scanned: ${report.dist.filesScanned}`,
    `Archives scanned: ${report.archives.length}`,
    ''
  ];

  lines.push('## Findings', '');
  const findings = [
    ...report.source.findings,
    ...report.dist.findings,
    ...report.archives.flatMap((archive) => archive.findings)
  ];

  if (findings.length === 0) {
    lines.push('- none');
  } else {
    lines.push(...findings.map(formatFinding));
  }

  if (report.failures.length > 0) {
    lines.push('', '## Failures', '', ...report.failures.map((failure) => `- ${failure}`));
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildClientSecretReport(options);
  const findings = [
    ...report.source.findings,
    ...report.dist.findings,
    ...report.archives.flatMap((archive) => archive.findings)
  ];

  console.log(formatReport(report));

  if (report.failures.length > 0 || findings.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(
    `Check passed (${report.source.filesScanned} source files, ${report.dist.filesScanned} build files, ${report.archives.length} archive(s))`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  main();
}
