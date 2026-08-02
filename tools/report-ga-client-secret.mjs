import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

import { inventoryBoundedZip, readBoundedZipText } from '../scripts/utils/boundedZipArchive.mjs';

const DEFAULT_SOURCE_DIR = 'src';
const DEFAULT_DIST_DIR = 'build/dist';
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.html', '.css']);
const URL_CANDIDATE_PATTERN = /https?:\/\/[^\s"'`<>()]+/gi;
const GOOGLE_ANALYTICS_HOST_PARTS = ['google-analytics', 'com'];
const GOOGLE_MEASUREMENT_PROTOCOL_PATH_PARTS = [
  ['mp', 'collect'],
  ['debug', 'mp', 'collect']
];

export const CLIENT_SECRET_PATTERNS = Object.freeze([
  {
    label: 'google endpoint',
    scan: scanGoogleEndpointCandidates
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
    if (typeof pattern.scan === 'function') {
      findings.push(...pattern.scan(scope, filePath, contents));
      continue;
    }

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

function scanGoogleEndpointCandidates(scope, filePath, contents) {
  const findings = [];

  URL_CANDIDATE_PATTERN.lastIndex = 0;
  for (const match of contents.matchAll(URL_CANDIDATE_PATTERN)) {
    const rawCandidate = match[0];
    const candidate = trimUrlCandidate(rawCandidate);
    if (!isGoogleMeasurementProtocolEndpointCandidate(candidate)) {
      continue;
    }

    const index = match.index ?? 0;
    const { line, column } = findLineAndColumn(contents, index);
    findings.push({
      scope,
      path: filePath,
      label: 'google endpoint',
      match: rawCandidate,
      line,
      column,
      snippet: lineAt(contents, line)
    });
  }

  return findings;
}

function trimUrlCandidate(candidate) {
  return candidate.replace(/[.,;:!?]+$/g, '');
}

function isGoogleMeasurementProtocolEndpointCandidate(candidate) {
  try {
    const url = new URL(candidate);
    const hostname = canonicalizeEndpointHostname(url.hostname);
    if (!isGoogleAnalyticsHost(hostname)) {
      return false;
    }

    const pathParts = canonicalizeEndpointPathParts(url.pathname);
    if (!pathParts) {
      return true;
    }

    return (
      pathParts.length > 0 &&
      GOOGLE_MEASUREMENT_PROTOCOL_PATH_PARTS.some(
        (parts) => pathParts.join('/') === parts.join('/')
      )
    );
  } catch {
    return false;
  }
}

function canonicalizeEndpointHostname(hostname) {
  return hostname.toLowerCase().replace(/\.+$/, '');
}

function canonicalizeEndpointPathParts(pathname) {
  const parts = pathname
    .replace(/\/+$/, '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  try {
    return parts.map((part) => decodeURIComponent(part).toLowerCase());
  } catch {
    return undefined;
  }
}

function isGoogleAnalyticsHost(hostname) {
  const googleAnalyticsHost = GOOGLE_ANALYTICS_HOST_PARTS.join('.');
  return hostname === googleAnalyticsHost || hostname.endsWith(`.${googleAnalyticsHost}`);
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

export async function scanArchiveWithPatterns(
  archivePath,
  patterns,
  scope = basename(archivePath)
) {
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
  const inventory = await inventoryBoundedZip(archivePath);

  for (const entry of inventory.entries) {
    if (entry.directory || !shouldScanContent(entry.path)) {
      continue;
    }
    const content = await readBoundedZipText(entry);
    if (content !== null) {
      findings.push(...scanTextWithPatterns(scope, entry.path, content, patterns));
    }
  }

  return {
    scope,
    archivePath,
    entryCount: inventory.entryCount,
    findings,
    failures: []
  };
}

export async function buildClientSecretReport({
  sourceDir = DEFAULT_SOURCE_DIR,
  distDir = DEFAULT_DIST_DIR,
  archives = []
} = {}) {
  const normalizedArchives = archives.map((archivePath) => resolve(archivePath));
  const source = scanDirectoryWithPatterns(resolve(sourceDir), 'source', CLIENT_SECRET_PATTERNS);
  const dist = scanDirectoryWithPatterns(resolve(distDir), 'build/dist', CLIENT_SECRET_PATTERNS);
  const archiveReports = await Promise.all(
    normalizedArchives.map((archivePath) =>
      scanArchiveWithPatterns(archivePath, CLIENT_SECRET_PATTERNS)
    )
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildClientSecretReport(options);
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
  await main();
}
