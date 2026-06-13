import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const REPORT_PATH = 'build/reports/ga-proxy-contract.json';
const CONTRACT_ENTRYPOINT = 'src/shared/analytics/analyticsProxyContract.ts';
const SOURCE_FILES_TO_SCAN = [
  'src/shared/analytics/analyticsProxyContract.ts',
  'src/shared/analytics/analyticsTransport.ts',
  'src/shared/analytics/analyticsEnvironment.ts'
];
const GOOGLE_ENDPOINT_PATTERN = /google-analytics\.com|debug\/mp\/collect|mp\/collect/i;
const SECRET_LIKE_VALUE_PATTERN =
  /api[_-]?secret|ga4?_api_secret|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]+/i;
const FORBIDDEN_KEY_NAMES = new Set([
  'api_secret',
  'ga_api_secret',
  'ga4_api_secret',
  'client_id',
  'clientId',
  'session_id',
  'sessionId',
  'measurement_id',
  'proxyEndpoint',
  'endpoint'
]);

function parseArgs(args) {
  const parsed = {
    check: false,
    outPath: REPORT_PATH
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--check') {
      parsed.check = true;
    } else if (arg === '--out') {
      parsed.outPath = args[index + 1] ?? REPORT_PATH;
      index += 1;
    }
  }

  return parsed;
}

async function loadProxyContractModule() {
  const repoRoot = process.cwd();
  const tempDir = await mkdtemp(join(tmpdir(), 'aiiinob-ga-proxy-contract-'));
  const outfile = join(tempDir, 'analyticsProxyContract.bundle.mjs');

  try {
    await build({
      entryPoints: [join(repoRoot, CONTRACT_ENTRYPOINT)],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      outfile,
      write: true,
      logLevel: 'silent'
    });

    return await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function writeReport(reportPath, contract) {
  const absolutePath = resolve(process.cwd(), reportPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(contract, null, 2)}\n`);
  return absolutePath;
}

function readReport(reportPath) {
  const absolutePath = resolve(process.cwd(), reportPath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function collectContractProblems(contract) {
  const problems = [];

  walkContract(contract, [], (value, path) => {
    const key = path[path.length - 1];
    if (typeof key === 'string' && FORBIDDEN_KEY_NAMES.has(key)) {
      problems.push(`forbidden key ${path.join('.')}`);
    }

    if (typeof value === 'string') {
      if (GOOGLE_ENDPOINT_PATTERN.test(value)) {
        problems.push(`google endpoint value at ${path.join('.')}`);
      }
      if (SECRET_LIKE_VALUE_PATTERN.test(value)) {
        problems.push(`secret-like value at ${path.join('.')}`);
      }
      if (/https?:\/\//i.test(value)) {
        problems.push(`direct endpoint value at ${path.join('.')}`);
      }
    }
  });

  return problems;
}

function collectSourceScanProblems() {
  const repoRoot = process.cwd();
  const problems = [];

  for (const relativePath of SOURCE_FILES_TO_SCAN) {
    const absolutePath = join(repoRoot, relativePath);
    const content = readFileSync(absolutePath, 'utf8');

    if (GOOGLE_ENDPOINT_PATTERN.test(content)) {
      problems.push(`${relativePath}: contains Google endpoint reference`);
    }
  }

  return problems;
}

function walkContract(value, path, visit) {
  visit(value, path);

  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkContract(entry, [...path, String(index)], visit));
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      walkContract(entry, [...path, key], visit);
    }
  }
}

function assertContractsEqual(expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error('analytics proxy contract drift: exported contract no longer matches schema-derived rebuild');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contractModule = await loadProxyContractModule();
  const contract = contractModule.ANALYTICS_PROXY_CONTRACT;
  const rebuiltContract = contractModule.buildAnalyticsProxyContract();

  if (!contract || typeof contract !== 'object') {
    throw new Error('analytics proxy contract module did not export ANALYTICS_PROXY_CONTRACT');
  }
  if (typeof contractModule.buildAnalyticsProxyContract !== 'function') {
    throw new Error('analytics proxy contract module did not export buildAnalyticsProxyContract()');
  }

  assertContractsEqual(contract, rebuiltContract);

  if (!args.check) {
    const absoluteReportPath = writeReport(args.outPath, contract);
    console.log(
      `[ga-proxy-contract] Wrote ${args.outPath} (${contract.events.length} events, transports: ${contract.transports.join(', ')})`
    );
    console.log(`[ga-proxy-contract] Absolute path: ${absoluteReportPath}`);
    return;
  }

  const report = readReport(args.outPath);
  if (report) {
    assertContractsEqual(contract, report);
  }

  const contractProblems = collectContractProblems(contract);
  const sourceProblems = collectSourceScanProblems();
  const problems = [...contractProblems, ...sourceProblems];

  if (problems.length > 0) {
    throw new Error(`ga proxy contract check failed:\n- ${problems.join('\n- ')}`);
  }

  console.log(
    `[ga-proxy-contract] Check passed (${contract.events.length} events, scanned ${SOURCE_FILES_TO_SCAN.length} source files)`
  );
}

await main();
