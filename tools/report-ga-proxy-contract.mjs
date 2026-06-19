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
const SECRET_LIKE_KEY_TOKENS = new Set(['secret', 'token', 'password']);
const FORBIDDEN_KEY_TOKEN_SEQUENCES = [
  ['client', 'id'],
  ['session', 'id'],
  ['measurement', 'id'],
  ['endpoint'],
  ['proxy', 'endpoint']
];

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

function getReportState(reportPath, expectedContract) {
  const absolutePath = resolve(process.cwd(), reportPath);
  if (!existsSync(absolutePath)) {
    return 'missing';
  }

  try {
    const parsedReport = JSON.parse(readFileSync(absolutePath, 'utf8'));
    return contractsEqual(expectedContract, parsedReport) ? 'current' : 'stale';
  } catch {
    return 'invalid';
  }
}

function collectContractProblems(contract) {
  const problems = [];

  walkContract(contract, [], (value, path) => {
    const key = path[path.length - 1];
    if (typeof key === 'string' && isForbiddenContractKeyName(key)) {
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

export function isForbiddenContractKeyName(keyName) {
  const tokens = tokenizeContractKeyName(keyName);
  if (tokens.length === 0) {
    return false;
  }

  if (tokens.join('.') === 'measurement.id.pattern') {
    return false;
  }

  if (tokens.some((token) => SECRET_LIKE_KEY_TOKENS.has(token))) {
    return true;
  }

  return FORBIDDEN_KEY_TOKEN_SEQUENCES.some((sequence) => matchesTokenSequence(tokens, sequence));
}

function tokenizeContractKeyName(keyName) {
  return keyName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function matchesTokenSequence(tokens, sequence) {
  return (
    tokens.length === sequence.length &&
    tokens.every((token, index) => token === sequence[index])
  );
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

function contractsEqual(expected, actual) {
  return JSON.stringify(expected) === JSON.stringify(actual);
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

  const reportState = getReportState(args.outPath, contract);

  const contractProblems = collectContractProblems(contract);
  const sourceProblems = collectSourceScanProblems();
  const problems = [...contractProblems, ...sourceProblems];

  if (problems.length > 0) {
    throw new Error(`ga proxy contract check failed:\n- ${problems.join('\n- ')}`);
  }

  writeReport(args.outPath, contract);
  console.log(
    `[ga-proxy-contract] Check passed (${contract.events.length} events, scanned ${SOURCE_FILES_TO_SCAN.length} source files, report: ${reportState})`
  );
}

function isDirectExecution() {
  return process.argv[1]
    ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
    : false;
}

if (isDirectExecution()) {
  await main();
}
