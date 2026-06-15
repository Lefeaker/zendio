import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

import {
  CLIENT_SECRET_PATTERNS,
  parseZipEntries,
  scanArchiveWithPatterns,
  scanDirectoryWithPatterns
} from './report-ga-client-secret.mjs';

const DEFAULT_DIST_DIR = 'build/dist';
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css']);
const DEBUG_SUCCESS_MARKER = '[analytics-events] Event sent (debug):';

function parseArgs(args) {
  const parsed = {
    distDir: DEFAULT_DIST_DIR,
    archives: [],
    check: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dist') {
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

function shouldScanContent(filePath) {
  return !filePath.endsWith('.map') && TEXT_EXTENSIONS.has(extname(filePath));
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

function scanDebugLogContents(scope, filePath, contents) {
  const markerIndex = contents.indexOf(DEBUG_SUCCESS_MARKER);
  if (markerIndex === -1) {
    return [];
  }

  const segmentEnd = contents.indexOf(');', markerIndex);
  const window = contents.slice(markerIndex, segmentEnd === -1 ? markerIndex + 240 : segmentEnd + 2);
  const leaksPayloadVariable = /\bpayload\b/.test(window);
  const leaksInlineFields =
    window.includes('{') && /\b(?:params|client_id|measurement_id)\b/.test(window);

  if (!leaksPayloadVariable && !leaksInlineFields) {
    return [];
  }

  return [
    {
      scope,
      path: filePath,
      label: 'debug success log exposes params',
      match: DEBUG_SUCCESS_MARKER,
      snippet: window.slice(0, 180)
    }
  ];
}

function scanDirectoryDebugLogs(root, scope) {
  if (!existsSync(root)) {
    return {
      scope,
      root,
      findings: [],
      failures: [`missing directory for ${scope}: ${root}`]
    };
  }

  const findings = [];
  for (const relativePath of listFiles(root)) {
    if (!shouldScanContent(relativePath)) {
      continue;
    }
    findings.push(
      ...scanDebugLogContents(scope, relativePath, readFileSync(join(root, relativePath), 'utf8'))
    );
  }

  return { scope, root, findings, failures: [] };
}

function scanArchiveDebugLogs(archivePath) {
  if (!existsSync(archivePath)) {
    return {
      scope: basename(archivePath),
      archivePath,
      findings: [],
      failures: [`missing archive for ${basename(archivePath)}: ${archivePath}`]
    };
  }

  const scope = basename(archivePath);
  const findings = [];
  for (const entry of parseZipEntries(archivePath)) {
    if (typeof entry.content !== 'string' || !shouldScanContent(entry.path)) {
      continue;
    }
    findings.push(...scanDebugLogContents(scope, entry.path, entry.content));
  }

  return {
    scope,
    archivePath,
    findings,
    failures: []
  };
}

function buildReleaseSurfaceReport({ distDir = DEFAULT_DIST_DIR, archives = [] } = {}) {
  const resolvedDistDir = resolve(distDir);
  const resolvedArchives = archives.map((archivePath) => resolve(archivePath));
  const distSecretReport = scanDirectoryWithPatterns(
    resolvedDistDir,
    'build/dist',
    CLIENT_SECRET_PATTERNS
  );
  const archiveSecretReports = resolvedArchives.map((archivePath) =>
    scanArchiveWithPatterns(archivePath, CLIENT_SECRET_PATTERNS)
  );
  const distDebugReport = scanDirectoryDebugLogs(resolvedDistDir, 'build/dist');
  const archiveDebugReports = resolvedArchives.map((archivePath) => scanArchiveDebugLogs(archivePath));

  return {
    version: 1,
    distDir: resolvedDistDir,
    distSecretReport,
    archiveSecretReports,
    distDebugReport,
    archiveDebugReports
  };
}

function formatSecretFinding(finding) {
  return `- ${finding.scope} ${finding.path}:${finding.line}:${finding.column} ${finding.label} (${finding.match})\n  ${finding.snippet}`;
}

function formatDebugFinding(finding) {
  return `- ${finding.scope} ${finding.path} ${finding.label} (${finding.match})\n  ${finding.snippet}`;
}

function formatReport(report) {
  const secretFindings = [
    ...report.distSecretReport.findings,
    ...report.archiveSecretReports.flatMap((archive) => archive.findings)
  ];
  const debugFindings = [
    ...report.distDebugReport.findings,
    ...report.archiveDebugReports.flatMap((archive) => archive.findings)
  ];

  const lines = [
    '# GA Release Surface Report',
    '',
    `Dist dir: ${report.distDir}`,
    `Archives scanned: ${report.archiveSecretReports.length}`,
    ''
  ];

  lines.push('## Archives', '');
  if (report.archiveSecretReports.length === 0) {
    lines.push('- none');
  } else {
    lines.push(
      ...report.archiveSecretReports.map((archive) =>
        `- ${basename(archive.archivePath)}`
      )
    );
  }

  lines.push('## GA Secret/Endpoint Findings', '');
  if (secretFindings.length === 0) {
    lines.push('- none');
  } else {
    lines.push(...secretFindings.map(formatSecretFinding));
  }

  lines.push('', '## Debug Success Log Findings', '');
  if (debugFindings.length === 0) {
    lines.push('- none');
  } else {
    lines.push(...debugFindings.map(formatDebugFinding));
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReleaseSurfaceReport(options);
  const failures = [
    ...report.distSecretReport.failures,
    ...report.archiveSecretReports.flatMap((archive) => archive.failures),
    ...report.distDebugReport.failures,
    ...report.archiveDebugReports.flatMap((archive) => archive.failures)
  ];
  const secretFindings = [
    ...report.distSecretReport.findings,
    ...report.archiveSecretReports.flatMap((archive) => archive.findings)
  ];
  const debugFindings = [
    ...report.distDebugReport.findings,
    ...report.archiveDebugReports.flatMap((archive) => archive.findings)
  ];

  console.log(formatReport(report));

  if (failures.length > 0 || secretFindings.length > 0 || debugFindings.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(`Check passed (${report.archiveSecretReports.length} archive(s))`);
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  main();
}
