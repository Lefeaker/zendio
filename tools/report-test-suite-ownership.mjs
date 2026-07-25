import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  auditRepositoryTestSuiteOwnership,
  formatTestSuiteOwnershipReport
} from '../scripts/utils/testSuiteOwnership.mjs';

export function main(argv = process.argv) {
  const args = argv.slice(2);
  if (args.some((argument) => argument !== '--check')) {
    console.error('Usage: node tools/report-test-suite-ownership.mjs [--check]');
    return { ok: false, report: undefined };
  }

  const report = auditRepositoryTestSuiteOwnership();
  process.stdout.write(formatTestSuiteOwnershipReport(report));
  return {
    ok: !args.includes('--check') || report.ok,
    report
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = main();
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
