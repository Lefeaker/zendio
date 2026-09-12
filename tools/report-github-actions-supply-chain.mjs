#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAlias, isMap, isPair, isScalar, isSeq, parseAllDocuments } from 'yaml';
import {
  GITHUB_ACTION_PINS,
  GITHUB_ACTION_PIN_RESOLUTION_DATE,
  GITHUB_ACTION_PIN_VERSION
} from '../scripts/config/githubActionPins.mjs';

export const GITHUB_ACTION_SUPPLY_CHAIN_REPORT_VERSION = 'github-actions-supply-chain-report-v1';
export const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const GITHUB_ROOT = '.github';
const ACTION_ROOT = '.github/actions';
const WORKFLOW_ROOT = '.github/workflows';
const ACTION_MANIFEST_NAMES = ['action.yml', 'action.yaml'];
const YAML_PATH_PATTERN = /\.(?:yml|yaml)$/u;
const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const ACTION_PATH_PATTERN =
  /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?(?:\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)+$/u;
const ALIAS_PATTERN = /^v[1-9][0-9]*$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const LIMITS = Object.freeze({
  gitOutputBytes: 2 << 20,
  files: 128,
  fileBytes: 1 << 20,
  cumulativeBytes: 4 << 20,
  documentNodes: 50_000,
  documentAliases: 64,
  documentDepth: 32
});

function compareText(left, right) {
  return left.localeCompare(right, 'en');
}

function scalarKey(node) {
  if (!isScalar(node)) return undefined;
  if (typeof node.value === 'string') return node.value;
  if (typeof node.source === 'string') return node.source;
  return String(node.value);
}

function mapPair(map, key) {
  if (!isMap(map)) return undefined;
  return map.items.find((item) => isPair(item) && scalarKey(item.key) === key);
}

function pairValue(map, key) {
  return mapPair(map, key)?.value;
}

function scalarValue(node) {
  return isScalar(node) && typeof node.value === 'string' ? node.value : undefined;
}

function mapKeys(map) {
  if (!isMap(map)) return [];
  return map.items
    .filter((item) => isPair(item) && scalarKey(item.key) !== undefined)
    .map((item) => scalarKey(item.key));
}

function lineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function locate(sourceStarts, offset) {
  let low = 0;
  let high = sourceStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (sourceStarts[middle] <= offset) low = middle + 1;
    else high = middle - 1;
  }
  const lineIndex = Math.max(0, high);
  return {
    line: lineIndex + 1,
    column: offset - sourceStarts[lineIndex] + 1
  };
}

function nodeOffset(node) {
  return Array.isArray(node?.range) && Number.isInteger(node.range[0]) ? node.range[0] : 0;
}

function addFinding(state, code, path, node, details = {}) {
  const record = state.records.get(path);
  const location = record ? locate(record.lineStarts, nodeOffset(node)) : { line: 1, column: 1 };
  state.findings.push({
    code,
    path,
    line: location.line,
    column: location.column,
    ...details
  });
}

function validatePinTable(pins, state) {
  const seenActions = new Set();
  const seenAliases = new Set();
  for (const pin of pins) {
    if (
      !pin ||
      typeof pin.action !== 'string' ||
      typeof pin.alias !== 'string' ||
      typeof pin.commit !== 'string' ||
      typeof pin.actionManifestSha256 !== 'string' ||
      !ACTION_PATH_PATTERN.test(pin.action) ||
      !ALIAS_PATTERN.test(pin.alias) ||
      !FULL_COMMIT_PATTERN.test(pin.commit) ||
      !SHA256_PATTERN.test(pin.actionManifestSha256)
    ) {
      addFinding(state, 'PIN_CONFIG_INVALID', 'scripts/config/githubActionPins.mjs', undefined);
      continue;
    }
    if (seenActions.has(pin.action)) {
      addFinding(
        state,
        'PIN_CONFIG_ACTION_DUPLICATE',
        'scripts/config/githubActionPins.mjs',
        undefined,
        {
          action: pin.action
        }
      );
    }
    const aliasIdentity = `${pin.action}@${pin.alias}`;
    if (seenAliases.has(aliasIdentity)) {
      addFinding(
        state,
        'PIN_CONFIG_ALIAS_DUPLICATE',
        'scripts/config/githubActionPins.mjs',
        undefined,
        {
          action: pin.action,
          alias: pin.alias
        }
      );
    }
    seenActions.add(pin.action);
    seenAliases.add(aliasIdentity);
  }
}

function gitVisibleYamlPaths(root, state) {
  let output;
  try {
    output = execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', GITHUB_ROOT],
      {
        cwd: root,
        encoding: 'buffer',
        maxBuffer: LIMITS.gitOutputBytes,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
  } catch (error) {
    addFinding(state, 'GIT_INVENTORY_FAILED', GITHUB_ROOT, undefined, {
      message: error instanceof Error ? error.message : String(error)
    });
    return [];
  }

  const paths = output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((path) => YAML_PATH_PATTERN.test(path))
    .sort(compareText);
  if (paths.length > LIMITS.files) {
    addFinding(state, 'GIT_INVENTORY_FILE_LIMIT', GITHUB_ROOT, undefined, {
      actual: paths.length,
      limit: LIMITS.files
    });
    return paths.slice(0, LIMITS.files);
  }
  return paths;
}

function validateDocumentShape(record, state) {
  let nodes = 0;
  let aliases = 0;
  let exceededDepth = false;

  function visit(node, depth) {
    if (!node) return;
    nodes += 1;
    if (depth > LIMITS.documentDepth) exceededDepth = true;
    if (isAlias(node)) aliases += 1;
    if (isPair(node)) {
      visit(node.key, depth + 1);
      visit(node.value, depth + 1);
    } else if (isMap(node) || isSeq(node)) {
      for (const item of node.items) visit(item, depth + 1);
    }
  }

  visit(record.document.contents, 0);
  if (nodes > LIMITS.documentNodes) {
    addFinding(state, 'YAML_NODE_LIMIT', record.path, record.document.contents, {
      actual: nodes,
      limit: LIMITS.documentNodes
    });
  }
  if (aliases > LIMITS.documentAliases) {
    addFinding(state, 'YAML_ALIAS_LIMIT', record.path, record.document.contents, {
      actual: aliases,
      limit: LIMITS.documentAliases
    });
  }
  if (exceededDepth) {
    addFinding(state, 'YAML_DEPTH_LIMIT', record.path, record.document.contents, {
      limit: LIMITS.documentDepth
    });
  }
}

function loadRecords(root, paths, state) {
  let cumulativeBytes = 0;
  for (const path of paths) {
    const absolute = resolve(root, path);
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch {
      addFinding(state, 'GIT_VISIBLE_FILE_MISSING', path, undefined);
      continue;
    }
    if (stat.isSymbolicLink()) {
      addFinding(state, 'GIT_VISIBLE_FILE_SYMLINK', path, undefined);
      continue;
    }
    if (!stat.isFile()) {
      addFinding(state, 'GIT_VISIBLE_FILE_NONREGULAR', path, undefined);
      continue;
    }
    if (stat.size > LIMITS.fileBytes) {
      addFinding(state, 'YAML_FILE_SIZE_LIMIT', path, undefined, {
        actual: stat.size,
        limit: LIMITS.fileBytes
      });
      continue;
    }
    cumulativeBytes += stat.size;
    if (cumulativeBytes > LIMITS.cumulativeBytes) {
      addFinding(state, 'YAML_CUMULATIVE_SIZE_LIMIT', path, undefined, {
        actual: cumulativeBytes,
        limit: LIMITS.cumulativeBytes
      });
      continue;
    }

    const source = readFileSync(absolute, 'utf8');
    const documents = parseAllDocuments(source, {
      keepSourceTokens: true,
      merge: true,
      prettyErrors: false,
      strict: true,
      uniqueKeys: true,
      version: '1.2'
    });
    if (documents.length !== 1) {
      addFinding(state, 'YAML_DOCUMENT_COUNT_INVALID', path, undefined, {
        actual: documents.length
      });
      continue;
    }
    const document = documents[0];
    const record = {
      path,
      source,
      lineStarts: lineStarts(source),
      document
    };
    state.records.set(path, record);
    for (const issue of [...document.errors, ...document.warnings]) {
      addFinding(
        state,
        'YAML_PARSE_FAILED',
        path,
        { range: [issue.pos?.[0] ?? 0] },
        {
          message: issue.message
        }
      );
    }
    validateDocumentShape(record, state);
  }
}

function trailingAliasComment(record, scalar) {
  if (!Array.isArray(scalar.range) || !Number.isInteger(scalar.range[1])) return undefined;
  const valueEnd = scalar.range[1];
  const lineEnd = record.source.indexOf('\n', valueEnd);
  const tail = record.source.slice(valueEnd, lineEnd < 0 ? record.source.length : lineEnd);
  const match = /^\s+#\s*(v[1-9][0-9]*)\s*$/u.exec(tail);
  return match?.[1];
}

function markMergePair(state, path, map) {
  const merge = mapPair(map, '<<');
  if (merge) addFinding(state, 'YAML_EXECUTABLE_MERGE_FORBIDDEN', path, merge.key);
}

function externalReferenceParts(reference) {
  const separator = reference.lastIndexOf('@');
  if (separator <= 0 || reference.indexOf('@') !== separator) return undefined;
  return {
    action: reference.slice(0, separator),
    revision: reference.slice(separator + 1)
  };
}

function registerExternalUse(state, record, scalar, context) {
  const reference = scalarValue(scalar);
  state.externalUses += 1;
  if (!reference) {
    addFinding(state, 'EXTERNAL_REFERENCE_SCALAR_REQUIRED', record.path, scalar, { context });
    return;
  }
  if (reference.startsWith('docker://')) {
    addFinding(state, 'DOCKER_REFERENCE_FORBIDDEN', record.path, scalar, { context, reference });
    return;
  }
  if (reference.includes('${{')) {
    addFinding(state, 'EXTERNAL_REFERENCE_EXPRESSION', record.path, scalar, { context, reference });
    return;
  }

  const parts = externalReferenceParts(reference);
  if (!parts || !ACTION_PATH_PATTERN.test(parts.action)) {
    addFinding(state, 'EXTERNAL_REFERENCE_INVALID', record.path, scalar, { context, reference });
    return;
  }
  const pin = state.pinByAction.get(parts.action);
  if (pin) state.usedPins.add(pin.action);
  if (!FULL_COMMIT_PATTERN.test(parts.revision)) {
    addFinding(state, 'EXTERNAL_REFERENCE_MUTABLE', record.path, scalar, { context, reference });
    return;
  }
  if (!pin) {
    addFinding(state, 'EXTERNAL_ACTION_UNPINNED', record.path, scalar, { context, reference });
    return;
  }
  if (parts.revision !== pin.commit) {
    addFinding(state, 'EXTERNAL_PIN_MISMATCH', record.path, scalar, {
      context,
      reference,
      expected: `${pin.action}@${pin.commit}`
    });
    return;
  }
  const comment = trailingAliasComment(record, scalar);
  if (!comment) {
    addFinding(state, 'EXTERNAL_ALIAS_COMMENT_MISSING', record.path, scalar, {
      context,
      reference,
      expected: pin.alias
    });
  } else if (comment !== pin.alias) {
    addFinding(state, 'EXTERNAL_ALIAS_COMMENT_MISMATCH', record.path, scalar, {
      context,
      reference,
      actual: comment,
      expected: pin.alias
    });
  }
}

function manifestForLocalReference(root, reference, visiblePaths, state, record, scalar, context) {
  if (reference.includes('@') || reference.includes('\\') || !reference.startsWith('./')) {
    addFinding(state, 'LOCAL_ACTION_REFERENCE_INVALID', record.path, scalar, {
      context,
      reference
    });
    return undefined;
  }
  const rawPath = reference.slice(2);
  const normalized = posix.normalize(rawPath).replace(/\/$/u, '');
  if (rawPath.split('/').includes('..') || !normalized.startsWith(`${ACTION_ROOT}/`)) {
    addFinding(state, 'LOCAL_ACTION_TRAVERSAL', record.path, scalar, { context, reference });
    return undefined;
  }
  const actionDirectory = resolve(root, normalized);
  const rootBoundary = `${resolve(root, ACTION_ROOT)}${sep}`;
  if (!actionDirectory.startsWith(rootBoundary)) {
    addFinding(state, 'LOCAL_ACTION_TRAVERSAL', record.path, scalar, { context, reference });
    return undefined;
  }
  try {
    const directoryStat = lstatSync(actionDirectory);
    if (directoryStat.isSymbolicLink()) {
      addFinding(state, 'LOCAL_ACTION_SYMLINK', record.path, scalar, { context, reference });
      return undefined;
    }
    if (!directoryStat.isDirectory()) {
      addFinding(state, 'LOCAL_ACTION_DIRECTORY_INVALID', record.path, scalar, {
        context,
        reference
      });
      return undefined;
    }
    const realDirectory = realpathSync(actionDirectory);
    const realRootBoundary = `${realpathSync(resolve(root, ACTION_ROOT))}${sep}`;
    if (!realDirectory.startsWith(realRootBoundary)) {
      addFinding(state, 'LOCAL_ACTION_TRAVERSAL', record.path, scalar, { context, reference });
      return undefined;
    }
  } catch {
    addFinding(state, 'LOCAL_ACTION_MISSING', record.path, scalar, { context, reference });
    return undefined;
  }

  const manifests = ACTION_MANIFEST_NAMES.map((name) => `${normalized}/${name}`).filter((path) => {
    try {
      return lstatSync(resolve(root, path)).isFile();
    } catch {
      return false;
    }
  });
  if (manifests.length !== 1) {
    addFinding(
      state,
      manifests.length === 0 ? 'LOCAL_ACTION_MANIFEST_MISSING' : 'LOCAL_ACTION_MANIFEST_DUAL',
      record.path,
      scalar,
      { context, reference }
    );
    return undefined;
  }
  const manifest = manifests[0];
  if (!visiblePaths.has(manifest)) {
    addFinding(state, 'LOCAL_ACTION_NOT_GIT_VISIBLE', record.path, scalar, {
      context,
      reference,
      manifest
    });
    return undefined;
  }
  return manifest;
}

function registerUses(state, record, scalar, context, visiblePaths) {
  if (isAlias(scalar)) {
    addFinding(state, 'YAML_EXECUTABLE_ALIAS_FORBIDDEN', record.path, scalar, { context });
    return;
  }
  const reference = scalarValue(scalar);
  if (reference?.startsWith('./')) {
    state.localUses += 1;
    const manifest = manifestForLocalReference(
      state.root,
      reference,
      visiblePaths,
      state,
      record,
      scalar,
      context
    );
    if (manifest) state.localEdges.push({ from: record.path, to: manifest, node: scalar });
    return;
  }
  registerExternalUse(state, record, scalar, context);
}

function scanSteps(state, record, steps, context, visiblePaths) {
  if (!isSeq(steps)) {
    addFinding(state, 'EXECUTABLE_STEPS_SEQUENCE_REQUIRED', record.path, steps, { context });
    return;
  }
  for (let index = 0; index < steps.items.length; index += 1) {
    const step = steps.items[index];
    const stepContext = `${context}.steps[${index}]`;
    if (!isMap(step)) {
      addFinding(state, 'EXECUTABLE_STEP_MAP_REQUIRED', record.path, step, {
        context: stepContext
      });
      continue;
    }
    markMergePair(state, record.path, step);
    const uses = pairValue(step, 'uses');
    if (uses) registerUses(state, record, uses, `${stepContext}.uses`, visiblePaths);
  }
}

function scanWorkflow(state, record, visiblePaths) {
  const root = record.document.contents;
  if (!isMap(root)) {
    addFinding(state, 'WORKFLOW_ROOT_MAP_REQUIRED', record.path, root);
    return;
  }
  markMergePair(state, record.path, root);
  const jobs = pairValue(root, 'jobs');
  if (!isMap(jobs)) {
    addFinding(state, 'WORKFLOW_JOBS_MAP_REQUIRED', record.path, jobs);
    return;
  }
  markMergePair(state, record.path, jobs);
  for (const item of jobs.items) {
    if (!isPair(item) || !isScalar(item.key) || !isMap(item.value)) {
      addFinding(state, 'WORKFLOW_JOB_MAP_REQUIRED', record.path, item);
      continue;
    }
    const jobId = scalarKey(item.key);
    if (!jobId) {
      addFinding(state, 'WORKFLOW_JOB_ID_SCALAR_REQUIRED', record.path, item.key);
      continue;
    }
    const job = item.value;
    const context = `jobs.${jobId}`;
    markMergePair(state, record.path, job);
    for (const forbidden of ['container', 'services']) {
      const pair = mapPair(job, forbidden);
      if (pair) {
        addFinding(state, 'WORKFLOW_RUNTIME_SERVICE_FORBIDDEN', record.path, pair.key, {
          context: `${context}.${forbidden}`
        });
      }
    }
    const reusable = pairValue(job, 'uses');
    if (reusable) {
      const reference = scalarValue(reusable);
      if (reference?.startsWith('./')) state.localUses += 1;
      else state.externalUses += 1;
      addFinding(state, 'REUSABLE_WORKFLOW_FORBIDDEN', record.path, reusable, {
        context: `${context}.uses`,
        reference
      });
    }
    const steps = pairValue(job, 'steps');
    if (steps) scanSteps(state, record, steps, context, visiblePaths);
  }
}

function scanAction(state, record, visiblePaths) {
  const root = record.document.contents;
  if (!isMap(root)) {
    addFinding(state, 'LOCAL_ACTION_ROOT_MAP_REQUIRED', record.path, root);
    return;
  }
  markMergePair(state, record.path, root);
  const runs = pairValue(root, 'runs');
  if (!isMap(runs)) {
    addFinding(state, 'LOCAL_ACTION_RUNS_MAP_REQUIRED', record.path, runs);
    return;
  }
  markMergePair(state, record.path, runs);
  const keys = mapKeys(runs);
  for (const key of keys) {
    if (!['using', 'steps'].includes(key)) {
      addFinding(
        state,
        'LOCAL_ACTION_EXECUTION_FIELD_FORBIDDEN',
        record.path,
        mapPair(runs, key)?.key,
        {
          field: key
        }
      );
    }
  }
  const using = scalarValue(pairValue(runs, 'using'));
  if (using !== 'composite') {
    addFinding(state, 'LOCAL_ACTION_COMPOSITE_REQUIRED', record.path, pairValue(runs, 'using'));
    return;
  }
  state.compositeActions.add(record.path);
  scanSteps(state, record, pairValue(runs, 'steps'), 'runs', visiblePaths);
}

function detectLocalCycles(state) {
  const adjacency = new Map();
  for (const edge of state.localEdges) {
    const targets = adjacency.get(edge.from) ?? [];
    targets.push(edge);
    adjacency.set(edge.from, targets);
  }
  const visiting = new Set();
  const visited = new Set();

  function visit(path) {
    if (visited.has(path)) return;
    visiting.add(path);
    for (const edge of adjacency.get(path) ?? []) {
      if (visiting.has(edge.to)) {
        addFinding(state, 'LOCAL_ACTION_RECURSION_CYCLE', edge.from, edge.node, {
          target: edge.to
        });
      } else {
        visit(edge.to);
      }
    }
    visiting.delete(path);
    visited.add(path);
  }

  for (const path of adjacency.keys()) visit(path);
}

function sortFindings(findings) {
  return [...findings].sort((left, right) => {
    for (const key of ['path', 'line', 'column', 'code', 'reference', 'context']) {
      const difference = String(left[key] ?? '').localeCompare(String(right[key] ?? ''), 'en', {
        numeric: true
      });
      if (difference !== 0) return difference;
    }
    return 0;
  });
}

export function scanGitHubActionsSupplyChain(options = {}) {
  const root = resolve(options.root ?? REPOSITORY_ROOT);
  const pins = options.pins ?? GITHUB_ACTION_PINS;
  const state = {
    root,
    pins,
    pinByAction: new Map(pins.map((pin) => [pin.action, pin])),
    usedPins: new Set(),
    records: new Map(),
    findings: [],
    externalUses: 0,
    localUses: 0,
    compositeActions: new Set(),
    localEdges: []
  };
  validatePinTable(pins, state);
  const paths = gitVisibleYamlPaths(root, state);
  const visiblePaths = new Set(paths);
  loadRecords(root, paths, state);

  for (const path of paths) {
    const record = state.records.get(path);
    if (!record || record.document.errors.length > 0 || record.document.warnings.length > 0) {
      continue;
    }
    if (path.startsWith(`${WORKFLOW_ROOT}/`)) scanWorkflow(state, record, visiblePaths);
    else if (/^\.github\/actions\/.+\/action\.ya?ml$/u.test(path)) {
      scanAction(state, record, visiblePaths);
    } else {
      addFinding(state, 'GITHUB_YAML_OWNER_INVALID', path, record.document.contents);
    }
  }
  detectLocalCycles(state);

  for (const pin of pins) {
    if (typeof pin?.action === 'string' && !state.usedPins.has(pin.action)) {
      addFinding(state, 'PIN_CONFIG_UNUSED', 'scripts/config/githubActionPins.mjs', undefined, {
        action: pin.action
      });
    }
  }

  const findings = sortFindings(state.findings);
  const summary = {
    yamlFiles: paths.length,
    workflowFiles: paths.filter((path) => path.startsWith(`${WORKFLOW_ROOT}/`)).length,
    actionFiles: paths.filter((path) => /^\.github\/actions\/.+\/action\.ya?ml$/u.test(path))
      .length,
    externalUses: state.externalUses,
    localUses: state.localUses,
    compositeActions: state.compositeActions.size,
    findings: findings.length
  };
  return {
    version: GITHUB_ACTION_SUPPLY_CHAIN_REPORT_VERSION,
    pinVersion: GITHUB_ACTION_PIN_VERSION,
    pinResolutionDate: GITHUB_ACTION_PIN_RESOLUTION_DATE,
    ok: findings.length === 0,
    summary,
    files: paths,
    pins: pins.map((pin) => ({
      action: pin.action,
      alias: pin.alias,
      commit: pin.commit,
      actionManifestSha256: pin.actionManifestSha256
    })),
    findings
  };
}

function parseCli(args) {
  if (args.length !== 1 || !['--report', '--check'].includes(args[0])) {
    throw new Error('Usage: report-github-actions-supply-chain.mjs --report|--check');
  }
  return args[0];
}

function runCli() {
  const mode = parseCli(process.argv.slice(2));
  const report = scanGitHubActionsSupplyChain();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (mode === '--check' && !report.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) runCli();
