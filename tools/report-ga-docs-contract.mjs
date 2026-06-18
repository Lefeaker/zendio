import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const DEFAULT_PROXY_CONTRACT_PATH = 'build/reports/ga-proxy-contract.json';
const PROXY_CONTRACT_ENTRYPOINT = 'src/shared/analytics/analyticsProxyContract.ts';
const DEFAULT_REFERENCE_DOC_PATH = 'docs/ga4-telemetry-reference.md';
const DEFAULT_CONFIG_DOC_PATH = 'docs/analytics-configuration-guide.md';
const DEFAULT_DASHBOARD_DOC_PATH = 'docs/google-analytics-dashboard-setup.md';
const OPTIONAL_SECRET_DOC_PATHS = [
  'docs/analytics-operations-runbook.md',
  'docs/error-analytics-system-overview.md',
  'docs/runtime-observability-and-regression.md',
  'docs/source-of-truth-index.md',
  'docs/engineering-entrypoints.md'
];

const ACTIVE_REFERENCE_CLASSES = new Set(['emitted', 'error', 'dev-only']);
const CATALOG_REFERENCE_CLASSES = new Set(['contract-only', 'future', 'inventory-only']);
const DASHBOARD_ALLOWED_CLASSES = new Set(['emitted', 'error']);
const CATALOG_MARKER_ID = 'catalog_only';
const TABLE_MARKER_PATTERN =
  /<!--\s*GA_SCHEMA_TABLE_START:([a-z0-9_-]+)\s*-->([\s\S]*?)<!--\s*GA_SCHEMA_TABLE_END:\1\s*-->/gi;
const FORBIDDEN_SECRET_ASSIGNMENT_PATTERN = /\b(GA4_API_SECRET|AIIINOB_GA_API_SECRET|api_secret)\s*=/gi;
const ALLOWED_SECRET_CONTEXT_PATTERN =
  /(server-only|server side|server-side|服务端|proxy|Cloudflare Worker secret|Worker secret|owner)/i;
const NEGATIVE_SECRET_CONTEXT_PATTERN =
  /(do not|must not|cannot|never|forbidden|禁止|不得|不能|不会|not prove|不证明|不应)/i;
const DASHBOARD_FORBIDDEN_DIMENSIONS = new Set([
  'duration_ms',
  'url',
  'raw_url',
  'vault_path',
  'file_path',
  'screenshot_bytes',
  'page_content',
  'raw_content',
  'markdown_body'
]);

function parseArgs(argv) {
  const args = {
    check: false,
    proxyContractPath: DEFAULT_PROXY_CONTRACT_PATH,
    referenceDocPath: DEFAULT_REFERENCE_DOC_PATH,
    configDocPath: DEFAULT_CONFIG_DOC_PATH,
    dashboardDocPath: DEFAULT_DASHBOARD_DOC_PATH,
    extraSecretDocPaths: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--check') {
      args.check = true;
      continue;
    }

    const next = argv[index + 1];
    if (arg === '--proxy-contract' && next) {
      args.proxyContractPath = next;
      index += 1;
      continue;
    }
    if (arg === '--reference-doc' && next) {
      args.referenceDocPath = next;
      index += 1;
      continue;
    }
    if (arg === '--config-doc' && next) {
      args.configDocPath = next;
      index += 1;
      continue;
    }
    if (arg === '--dashboard-doc' && next) {
      args.dashboardDocPath = next;
      index += 1;
      continue;
    }
    if (arg === '--extra-secret-doc' && next) {
      args.extraSecretDocPaths.push(next);
      index += 1;
      continue;
    }
  }

  return args;
}

function readRequiredFile(relativeOrAbsolutePath, missingMessage) {
  const absolutePath = resolve(process.cwd(), relativeOrAbsolutePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`${missingMessage}: ${relativeOrAbsolutePath}`);
  }
  return {
    absolutePath,
    contents: readFileSync(absolutePath, 'utf8')
  };
}

function readOptionalFile(relativeOrAbsolutePath) {
  const absolutePath = resolve(process.cwd(), relativeOrAbsolutePath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }

  return {
    absolutePath,
    contents: readFileSync(absolutePath, 'utf8')
  };
}

function validateProxyContract(contract, sourceLabel) {
  if (!contract || !Array.isArray(contract.events)) {
    throw new Error(`Invalid analytics proxy contract report: ${sourceLabel}`);
  }

  return contract;
}

async function loadProxyContractFromSource() {
  const repoRoot = process.cwd();
  const tempDir = await mkdtemp(join(tmpdir(), 'aiiinob-ga-docs-contract-'));
  const outfile = join(tempDir, 'analyticsProxyContract.bundle.mjs');

  try {
    await build({
      entryPoints: [join(repoRoot, PROXY_CONTRACT_ENTRYPOINT)],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      outfile,
      write: true,
      logLevel: 'silent'
    });

    const contractModule = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
    const contract =
      contractModule.ANALYTICS_PROXY_CONTRACT ??
      (typeof contractModule.buildAnalyticsProxyContract === 'function'
        ? contractModule.buildAnalyticsProxyContract()
        : undefined);

    return validateProxyContract(contract, PROXY_CONTRACT_ENTRYPOINT);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function loadProxyContract(contractPath) {
  const absolutePath = resolve(process.cwd(), contractPath);
  if (existsSync(absolutePath)) {
    const parsed = JSON.parse(readFileSync(absolutePath, 'utf8'));
    return {
      contract: validateProxyContract(parsed, contractPath),
      source: 'report'
    };
  }

  const defaultReportPath = resolve(process.cwd(), DEFAULT_PROXY_CONTRACT_PATH);
  if (absolutePath !== defaultReportPath) {
    throw new Error(
      `GA docs contract requires a proxy contract report; missing ${contractPath}`
    );
  }

  return {
    contract: await loadProxyContractFromSource(),
    source: 'schema'
  };
}

function normalizeContractEvent(event) {
  const requiredParams = Array.isArray(event.requiredParams) ? event.requiredParams : [];
  const optionalParams = Array.isArray(event.optionalParams) ? event.optionalParams : [];
  const allowedParams = Array.isArray(event.allowedParams)
    ? event.allowedParams
    : [...requiredParams, ...optionalParams, ...Object.keys(event.paramValidators ?? {})];

  return {
    ...event,
    requiredParams,
    optionalParams,
    allowedParams
  };
}

function buildExpectedEventMap(contract, allowedClasses) {
  const entries = contract.events
    .filter((event) => allowedClasses.has(event.classification))
    .map((event) => normalizeContractEvent(event));
  return new Map(entries.map((event) => [event.name, event]));
}

function extractMarkedReferenceRows(referenceDoc) {
  const activeRows = [];
  const catalogRows = [];
  const problems = [];
  const seenMarkerIds = new Set();
  let match;

  while ((match = TABLE_MARKER_PATTERN.exec(referenceDoc)) !== null) {
    const markerId = match[1];
    const block = match[2];
    const parsedRows = parseMarkdownTableRows(block);

    if (seenMarkerIds.has(markerId)) {
      problems.push(`duplicate GA schema marker: ${markerId}`);
      continue;
    }

    seenMarkerIds.add(markerId);

    if (markerId === CATALOG_MARKER_ID) {
      catalogRows.push(...parsedRows);
    } else {
      activeRows.push(...parsedRows);
    }
  }

  if (activeRows.length === 0) {
    problems.push('missing active GA schema table markers');
  }
  if (catalogRows.length === 0) {
    problems.push(`missing ${CATALOG_MARKER_ID} GA schema table marker`);
  }

  return {
    activeRows,
    catalogRows,
    markerIds: [...seenMarkerIds],
    problems
  };
}

function parseMarkdownTableRows(block) {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 4)
    .filter((cells) => cells[0] !== 'Event')
    .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
    .map((cells) => ({
      eventName: stripInlineCode(cells[0]),
      documentedParams: parseDocumentedParams(cells[1]),
      classification: stripInlineCode(cells[2]),
      runtimeAllowed: stripInlineCode(cells[3])
    }));
}

function stripInlineCode(value) {
  return value.replace(/^`|`$/g, '').trim();
}

function parseDocumentedParams(value) {
  const normalized = value.trim();
  if (normalized.length === 0 || /^none$/i.test(normalized)) {
    return {
      required: [],
      optional: [],
      duplicates: []
    };
  }

  const required = [];
  const optional = [];
  const duplicates = [];
  const seen = new Set();

  for (const rawPart of normalized.split(',')) {
    const stripped = stripInlineCode(rawPart.trim());
    if (stripped.length === 0) {
      continue;
    }

    const isOptional = stripped.endsWith('?');
    const paramName = (isOptional ? stripped.slice(0, -1) : stripped).trim();
    if (paramName.length === 0) {
      continue;
    }

    if (seen.has(paramName)) {
      duplicates.push(paramName);
      continue;
    }

    seen.add(paramName);
    if (isOptional) {
      optional.push(paramName);
    } else {
      required.push(paramName);
    }
  }

  return {
    required,
    optional,
    duplicates
  };
}

function compareDocumentedParams(row, expected, label) {
  const problems = [];
  const expectedRequired = new Set(expected.requiredParams);
  const expectedOptional = new Set(expected.optionalParams);
  const actualRequired = new Set(row.documentedParams.required);
  const actualOptional = new Set(row.documentedParams.optional);

  if (row.documentedParams.duplicates.length > 0) {
    problems.push(
      `duplicate ${label} docs params for ${row.eventName}: ${row.documentedParams.duplicates.join(', ')}`
    );
  }

  const requiredMarkedOptional = row.documentedParams.optional.filter((param) =>
    expectedRequired.has(param)
  );
  const optionalMarkedRequired = row.documentedParams.required.filter((param) =>
    expectedOptional.has(param)
  );

  if (requiredMarkedOptional.length > 0) {
    problems.push(
      `optional marker mismatch for ${row.eventName}: expected required params, got optional ${requiredMarkedOptional.join(', ')}`
    );
  }
  if (optionalMarkedRequired.length > 0) {
    problems.push(
      `optional marker mismatch for ${row.eventName}: expected optional params, got required ${optionalMarkedRequired.join(', ')}`
    );
  }

  const missingRequired = expected.requiredParams.filter(
    (param) => !actualRequired.has(param) && !actualOptional.has(param)
  );
  const missingOptional = expected.optionalParams.filter(
    (param) => !actualRequired.has(param) && !actualOptional.has(param)
  );
  const extraRequired = row.documentedParams.required.filter(
    (param) => !expectedRequired.has(param) && !expectedOptional.has(param)
  );
  const extraOptional = row.documentedParams.optional.filter(
    (param) => !expectedRequired.has(param) && !expectedOptional.has(param)
  );

  if (missingRequired.length > 0) {
    problems.push(`missing required params for ${row.eventName}: ${missingRequired.join(', ')}`);
  }
  if (missingOptional.length > 0) {
    problems.push(`missing optional params for ${row.eventName}: ${missingOptional.join(', ')}`);
  }
  if (extraRequired.length > 0) {
    problems.push(`extra required params for ${row.eventName}: ${extraRequired.join(', ')}`);
  }
  if (extraOptional.length > 0) {
    problems.push(`extra optional params for ${row.eventName}: ${extraOptional.join(', ')}`);
  }

  return problems;
}

function compareReferenceRows(rows, expectedMap, label) {
  const problems = [];
  const seen = new Set();
  const actualMap = new Map();

  for (const row of rows) {
    if (seen.has(row.eventName)) {
      problems.push(`duplicate ${label} docs row: ${row.eventName}`);
      continue;
    }

    seen.add(row.eventName);
    actualMap.set(row.eventName, row);
  }

  const missing = [...expectedMap.keys()].filter((eventName) => !actualMap.has(eventName));
  const extra = [...actualMap.keys()].filter((eventName) => !expectedMap.has(eventName));

  if (missing.length > 0) {
    problems.push(`missing ${label} docs rows: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    problems.push(`extra ${label} docs rows: ${extra.join(', ')}`);
  }

  for (const [eventName, row] of actualMap.entries()) {
    const expected = expectedMap.get(eventName);
    if (!expected) {
      continue;
    }

    if (row.classification !== expected.classification) {
      problems.push(
        `classification mismatch for ${eventName}: expected ${expected.classification}, got ${row.classification}`
      );
    }

    const expectedRuntime = String(expected.runtimeAllowed);
    if (row.runtimeAllowed !== expectedRuntime) {
      problems.push(
        `runtime mismatch for ${eventName}: expected ${expectedRuntime}, got ${row.runtimeAllowed}`
      );
    }

    problems.push(...compareDocumentedParams(row, expected, label));
  }

  return {
    problems,
    count: actualMap.size
  };
}

function extractDashboardEventMentions(dashboardDoc, knownEventNames) {
  const events = new Set();

  for (const line of dashboardDoc.split('\n')) {
    if (!/^\s*-\s+/.test(line)) {
      continue;
    }

    for (const match of line.matchAll(/`([^`]+)`/g)) {
      const candidate = match[1].trim();
      if (knownEventNames.has(candidate)) {
        events.add(candidate);
      }
    }
  }

  return [...events].sort();
}

function collectDashboardProblems(dashboardDoc, contract) {
  const problems = [];
  const allEventNames = new Set(contract.events.map((event) => event.name));
  const allowedDashboardEvents = new Set(
    contract.events
      .filter((event) => DASHBOARD_ALLOWED_CLASSES.has(event.classification))
      .map((event) => event.name)
  );
  const allowedDashboardParams = new Set(
    contract.events
      .filter((event) => DASHBOARD_ALLOWED_CLASSES.has(event.classification))
      .flatMap((event) => normalizeContractEvent(event).allowedParams)
  );

  const mentionedEvents = extractDashboardEventMentions(dashboardDoc, allEventNames);
  const disallowedEvents = mentionedEvents.filter((eventName) => !allowedDashboardEvents.has(eventName));
  const mentionedParams = extractDashboardDocumentedParams(dashboardDoc);
  const unknownParams = mentionedParams.filter((paramName) => !allowedDashboardParams.has(paramName));

  if (disallowedEvents.length > 0) {
    problems.push(`dashboard recommends non-active events: ${disallowedEvents.join(', ')}`);
  }
  if (unknownParams.length > 0) {
    problems.push(`dashboard documents unknown params: ${unknownParams.join(', ')}`);
  }

  const forbiddenDimensions = extractDashboardForbiddenDimensions(dashboardDoc);
  if (forbiddenDimensions.length > 0) {
    problems.push(`dashboard uses forbidden raw dimensions: ${forbiddenDimensions.join(', ')}`);
  }

  return {
    problems,
    mentionedEventCount: mentionedEvents.length,
    mentionedParamCount: mentionedParams.length
  };
}

function extractDashboardDocumentedParams(dashboardDoc) {
  const params = new Set();

  for (const line of dashboardDoc.split('\n')) {
    const tableMatch = line.match(/^\s*\|\s*`([^`]+)`\s*\|/);
    const candidate = tableMatch?.[1]?.trim();

    if (!candidate || candidate === 'Event' || candidate === 'Parameter') {
      continue;
    }

    params.add(candidate);
  }

  return [...params].sort();
}

function extractDashboardForbiddenDimensions(dashboardDoc) {
  const forbidden = new Set();

  for (const line of dashboardDoc.split('\n')) {
    const tableMatch = line.match(/^\s*\|\s*`([^`]+)`\s*\|/);
    const bulletMatch = line.match(/^\s*-\s+`([^`]+)`/);
    const candidate = tableMatch?.[1] ?? bulletMatch?.[1];

    if (candidate && DASHBOARD_FORBIDDEN_DIMENSIONS.has(candidate.trim())) {
      forbidden.add(candidate.trim());
    }
  }

  return [...forbidden].sort();
}

function collectSecretGuidanceProblems(docsToScan) {
  const problems = [];

  for (const doc of docsToScan) {
    if (!doc) {
      continue;
    }

    const contents = doc.contents;
    for (const match of contents.matchAll(FORBIDDEN_SECRET_ASSIGNMENT_PATTERN)) {
      problems.push(
        `forbidden extension-side secret instruction in ${doc.absolutePath}: ${match[1]}`
      );
    }

    for (const match of contents.matchAll(/\b(GA4_API_SECRET|api_secret)\b/gi)) {
      const start = Math.max(0, match.index - 120);
      const end = Math.min(contents.length, match.index + match[0].length + 120);
      const snippet = contents.slice(start, end);

      if (
        !ALLOWED_SECRET_CONTEXT_PATTERN.test(snippet) &&
        !NEGATIVE_SECRET_CONTEXT_PATTERN.test(snippet)
      ) {
        problems.push(
          `secret mention lacks owner proxy/server context in ${doc.absolutePath}: ${match[1]}`
        );
      }
    }
  }

  return problems;
}

export async function collectGaDocsContractReport(options) {
  const { contract, source } = await loadProxyContract(options.proxyContractPath);
  const referenceDoc = readRequiredFile(options.referenceDocPath, 'Missing GA reference doc');
  const configDoc = readRequiredFile(options.configDocPath, 'Missing analytics config doc');
  const dashboardDoc = readRequiredFile(options.dashboardDocPath, 'Missing GA dashboard doc');
  const extraSecretDocs = options.extraSecretDocPaths
    .map((path) => readOptionalFile(path))
    .filter(Boolean);

  const extractedReferenceRows = extractMarkedReferenceRows(referenceDoc.contents);
  const activeExpectedMap = buildExpectedEventMap(contract, ACTIVE_REFERENCE_CLASSES);
  const catalogExpectedMap = buildExpectedEventMap(contract, CATALOG_REFERENCE_CLASSES);
  const activeComparison = compareReferenceRows(
    extractedReferenceRows.activeRows,
    activeExpectedMap,
    'active'
  );
  const catalogComparison = compareReferenceRows(
    extractedReferenceRows.catalogRows,
    catalogExpectedMap,
    'catalog'
  );
  const dashboardReport = collectDashboardProblems(dashboardDoc.contents, contract);
  const secretProblems = collectSecretGuidanceProblems([
    referenceDoc,
    configDoc,
    dashboardDoc,
    ...extraSecretDocs
  ]);

  const problems = [
    ...extractedReferenceRows.problems,
    ...activeComparison.problems,
    ...catalogComparison.problems,
    ...dashboardReport.problems,
    ...secretProblems
  ];

  return {
    summary: {
      contractSource: source,
      expectedActiveEventCount: activeExpectedMap.size,
      expectedCatalogEventCount: catalogExpectedMap.size,
      documentedActiveEventCount: activeComparison.count,
      documentedCatalogEventCount: catalogComparison.count,
      dashboardEventMentionCount: dashboardReport.mentionedEventCount,
      dashboardParamMentionCount: dashboardReport.mentionedParamCount,
      secretDocsScanned: 3 + extraSecretDocs.length
    },
    problems
  };
}

function printReport(report) {
  console.log(`[ga-docs-contract] Contract source: ${report.summary.contractSource}`);
  console.log(
    `[ga-docs-contract] Active rows: ${report.summary.documentedActiveEventCount}/${report.summary.expectedActiveEventCount}`
  );
  console.log(
    `[ga-docs-contract] Catalog rows: ${report.summary.documentedCatalogEventCount}/${report.summary.expectedCatalogEventCount}`
  );
  console.log(
    `[ga-docs-contract] Dashboard event mentions: ${report.summary.dashboardEventMentionCount}`
  );
  console.log(
    `[ga-docs-contract] Dashboard param mentions: ${report.summary.dashboardParamMentionCount}`
  );
  console.log(`[ga-docs-contract] Secret docs scanned: ${report.summary.secretDocsScanned}`);

  if (report.problems.length === 0) {
    console.log('[ga-docs-contract] Check passed');
    return;
  }

  console.log(`[ga-docs-contract] Problems (${report.problems.length}):`);
  for (const problem of report.problems) {
    console.log(`- ${problem}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await collectGaDocsContractReport({
    ...args,
    extraSecretDocPaths:
      args.extraSecretDocPaths.length > 0 ? args.extraSecretDocPaths : OPTIONAL_SECRET_DOC_PATHS
  });

  printReport(report);

  if (args.check && report.problems.length > 0) {
    throw new Error(`ga docs contract check failed with ${report.problems.length} problem(s)`);
  }
}

function isDirectExecution() {
  return process.argv[1]
    ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
    : false;
}

if (isDirectExecution()) {
  await main();
}
