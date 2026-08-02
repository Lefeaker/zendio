import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function isModuleRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value) {
  return typeof value === 'string';
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(isString);
}

function requiredCallable(module, name, modulePath) {
  const value = module[name];
  if (typeof value !== 'function') {
    throw new TypeError(`NPM_AUDIT_TEST_EXPORT_NOT_CALLABLE:${modulePath}:${name}`);
  }
  return value;
}

function requiredString(module, name, modulePath) {
  const value = module[name];
  if (!isString(value)) throw new TypeError(`NPM_AUDIT_TEST_EXPORT_NOT_STRING:${modulePath}:${name}`);
  return value;
}

function requiredStringArray(module, name, modulePath) {
  const value = module[name];
  if (!isStringArray(value)) {
    throw new TypeError(`NPM_AUDIT_TEST_EXPORT_NOT_STRING_ARRAY:${modulePath}:${name}`);
  }
  return value;
}

function requiredObject(module, name, modulePath) {
  const value = module[name];
  if (!isModuleRecord(value)) {
    throw new TypeError(`NPM_AUDIT_TEST_EXPORT_NOT_OBJECT:${modulePath}:${name}`);
  }
  return value;
}

async function loadModule(modulePath) {
  const observed = await import(modulePath);
  if (!isModuleRecord(observed)) throw new TypeError(`NPM_AUDIT_TEST_MODULE_NOT_OBJECT:${modulePath}`);
  return observed;
}

function moduleUrl(relativePath) {
  return pathToFileURL(resolve(relativePath)).href;
}

export async function loadCanonicalJson() {
  const modulePath = moduleUrl('tools/npm-audit-regression/canonical-json.mjs');
  const module = await loadModule(modulePath);
  return {
    canonicalJsonBytes: requiredCallable(module, 'canonicalJsonBytes', modulePath),
    parseJsonBytesStrict: requiredCallable(module, 'parseJsonBytesStrict', modulePath),
    readCanonicalJsonFileBounded: requiredCallable(module, 'readCanonicalJsonFileBounded', modulePath),
    assertPlainJson: requiredCallable(module, 'assertPlainJson', modulePath),
    readFileBounded: requiredCallable(module, 'readFileBounded', modulePath)
  };
}

export async function loadTransitionValidator() {
  const modulePath = moduleUrl('tools/npm-audit-regression/transition-validator.mjs');
  const module = await loadModule(modulePath);
  return {
    R02_TRANSITION_ARTIFACT_SHA256: requiredString(module, 'R02_TRANSITION_ARTIFACT_SHA256', modulePath),
    getR02ImmutableTransition: requiredCallable(module, 'getR02ImmutableTransition', modulePath),
    loadTransitionManifest: requiredCallable(module, 'loadTransitionManifest', modulePath)
  };
}

export async function loadEvidenceChain() {
  const modulePath = moduleUrl('tools/npm-audit-regression/evidence-chain.mjs');
  const module = await loadModule(modulePath);
  return {
    R02_ORIGIN_PATHS: requiredStringArray(module, 'R02_ORIGIN_PATHS', modulePath),
    writeFileExclusive: requiredCallable(module, 'writeFileExclusive', modulePath),
    durablePublishNoReplace: requiredCallable(module, 'durablePublishNoReplace', modulePath),
    ensureCleanTree: requiredCallable(module, 'ensureCleanTree', modulePath),
    assertRecordedCommitTree: requiredCallable(module, 'assertRecordedCommitTree', modulePath),
    assertSingleParentCommit: requiredCallable(module, 'assertSingleParentCommit', modulePath),
    rejectEvidenceAliases: requiredCallable(module, 'rejectEvidenceAliases', modulePath),
    assertTerminalCandidateTopology: requiredCallable(module, 'assertTerminalCandidateTopology', modulePath),
    assertTerminalReanchorTopology: requiredCallable(module, 'assertTerminalReanchorTopology', modulePath),
    assertPortableRuntimeBinding: requiredCallable(module, 'assertPortableRuntimeBinding', modulePath)
  };
}

export async function loadRuntimeDiscovery() {
  const modulePath = moduleUrl('tools/npm-audit-regression/runtime-discovery.mjs');
  const module = await loadModule(modulePath);
  return {
    assertClosedRuntimeEnvironment: requiredCallable(module, 'assertClosedRuntimeEnvironment', modulePath),
    detectNpmCommand: requiredCallable(module, 'detectNpmCommand', modulePath),
    revalidateRuntime: requiredCallable(module, 'revalidateRuntime', modulePath),
    runNpmAudit: requiredCallable(module, 'runNpmAudit', modulePath)
  };
}

export async function loadAuditReport() {
  const modulePath = moduleUrl('tools/npm-audit-regression/audit-report.mjs');
  const module = await loadModule(modulePath);
  return {
    assertAuditReportSchema: requiredCallable(module, 'assertAuditReportSchema', modulePath),
    compareAuditReports: requiredCallable(module, 'compareAuditReports', modulePath)
  };
}

export async function loadNpmAuditRegression() {
  const modulePath = moduleUrl('tools/check-npm-audit-regression.mjs');
  const module = await loadModule(modulePath);
  return {
    npmAuditRegressionTestHooks: requiredObject(module, 'npmAuditRegressionTestHooks', modulePath),
    getR02ImmutableTransition: requiredCallable(module, 'getR02ImmutableTransition', modulePath),
    createDependencyProjection: requiredCallable(module, 'createDependencyProjection', modulePath)
  };
}
