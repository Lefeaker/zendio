import { lstatSync, openSync, closeSync, readFileSync } from 'node:fs';
import { constants as fsConstants } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runLockedDependencyCruiser } from '../scripts/utils/releasePublicBuildConfig.mjs';

export const MIN_MODULES = 400;
export const MIN_DEPENDENCIES = 300;
export const MAX_INPUT_JSON_BYTES = 50 * 1024 * 1024;

function readBoundedFixture(path) {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_INPUT_JSON_BYTES) {
    throw new Error('DEPENDENCY_CRUISER_INPUT_INVALID');
  }
  const fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const bytes = readFileSync(fd);
    if (bytes.length !== stats.size) throw new Error('DEPENDENCY_CRUISER_INPUT_CHANGED');
    return bytes;
  } finally {
    closeSync(fd);
  }
}

export function parseCruiseJson(bytes) {
  const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (input.length === 0 || input.length > MAX_INPUT_JSON_BYTES) {
    throw new Error('DEPENDENCY_CRUISER_JSON_SIZE_INVALID');
  }
  let value;
  try {
    value = JSON.parse(input.toString('utf8'));
  } catch (error) {
    throw new Error(
      `DEPENDENCY_CRUISER_JSON_INVALID:${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('DEPENDENCY_CRUISER_JSON_SHAPE_INVALID');
  }
  return value;
}

export function summarizeCruise(cruiseResult) {
  const modules = Array.isArray(cruiseResult.modules) ? cruiseResult.modules.length : 0;
  const dependencies =
    cruiseResult.summary?.totalDependenciesCruised ??
    (cruiseResult.modules ?? []).reduce(
      (count, module) =>
        count + (Array.isArray(module.dependencies) ? module.dependencies.length : 0),
      0
    );
  const violations = Array.isArray(cruiseResult.summary?.violations)
    ? cruiseResult.summary.violations
    : [];
  return { modules, dependencies, violations };
}

export function evaluateCruise(summary) {
  const failures = [];
  if (summary.modules < MIN_MODULES) {
    failures.push(
      `module coverage below threshold: modules=${summary.modules} minimum=${MIN_MODULES}; stop for owner review if the full graph is genuinely smaller`
    );
  }
  if (summary.dependencies < MIN_DEPENDENCIES) {
    failures.push(
      `dependency coverage below threshold: dependencies=${summary.dependencies} minimum=${MIN_DEPENDENCIES}; stop for owner review if the full graph is genuinely smaller`
    );
  }
  if (summary.violations.length > 0) {
    const violationList = summary.violations
      .map((violation) => {
        const rule = violation.rule?.name ?? 'unknown-rule';
        return `${rule}: ${violation.from ?? 'unknown'} -> ${violation.to ?? 'unknown'}`;
      })
      .join('\n');
    failures.push(`dependency-cruiser violations found:\n${violationList}`);
  }
  return failures;
}

function parseArgs(args) {
  if (args.length === 0) return { inputJson: null };
  if (args.length !== 2 || args[0] !== '--input-json' || !args[1] || args[1].startsWith('--')) {
    throw new Error('DEPENDENCY_CRUISER_ARGUMENTS_INVALID');
  }
  return { inputJson: resolve(args[1]) };
}

export function runDependencyCruiserReport(args = [], dependencies = {}) {
  const { inputJson } = parseArgs(args);
  const bytes = inputJson
    ? readBoundedFixture(inputJson)
    : (dependencies.runLockedDependencyCruiser ?? runLockedDependencyCruiser)().stdout;
  const cruiseResult = parseCruiseJson(bytes);
  const summary = summarizeCruise(cruiseResult);
  return Object.freeze({ summary, failures: evaluateCruise(summary) });
}

function main() {
  const report = runDependencyCruiserReport(process.argv.slice(2));
  console.log(
    `modules=${report.summary.modules} dependencies=${report.summary.dependencies} violations=${report.summary.violations.length}`
  );
  if (report.failures.length > 0) {
    console.error(report.failures.join('\n'));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
