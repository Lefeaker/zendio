import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export const MIN_MODULES = 400;
export const MIN_DEPENDENCIES = 300;

function readJsonFromArgs(args) {
  const inputIndex = args.indexOf('--input-json');
  if (inputIndex === -1) {
    return null;
  }
  const inputPath = args[inputIndex + 1];
  if (!inputPath) {
    throw new Error('--input-json requires a path.');
  }
  return JSON.parse(readFileSync(inputPath, 'utf8'));
}

function runDependencyCruiser() {
  const result = spawnSync(
    'npx',
    [
      '--yes',
      'dependency-cruiser@16.10.4',
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      'json',
      'src/**/*.ts',
      'src/**/*.tsx',
      'src/**/*.js'
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024
    }
  );

  if (result.error) {
    throw result.error;
  }
  if (!result.stdout.trim()) {
    throw new Error(result.stderr.trim() || 'dependency-cruiser produced no JSON output.');
  }
  return JSON.parse(result.stdout);
}

export function summarizeCruise(cruiseResult) {
  const modules = Array.isArray(cruiseResult.modules) ? cruiseResult.modules.length : 0;
  const dependencies =
    cruiseResult.summary?.totalDependenciesCruised ??
    (cruiseResult.modules ?? []).reduce(
      (count, module) => count + (Array.isArray(module.dependencies) ? module.dependencies.length : 0),
      0
    );
  const violations = Array.isArray(cruiseResult.summary?.violations)
    ? cruiseResult.summary.violations
    : [];
  return {
    modules,
    dependencies,
    violations
  };
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

function main() {
  const cruiseResult = readJsonFromArgs(process.argv.slice(2)) ?? runDependencyCruiser();
  const summary = summarizeCruise(cruiseResult);
  console.log(
    `modules=${summary.modules} dependencies=${summary.dependencies} violations=${summary.violations.length}`
  );

  const failures = evaluateCruise(summary);
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
}

main();
