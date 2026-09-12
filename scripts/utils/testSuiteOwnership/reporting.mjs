import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createBrowserTestShardSuites,
  createE2eTestShards,
  createUnitTestShards
} from '../testShards.mjs';
import { listGitVisibleTestFiles, readUtf8 } from './gitInventory.mjs';
import {
  PLAYWRIGHT_CONFIG_PATHS,
  VITEST_CONFIG_PATHS,
  parsePlaywrightConfig,
  parseVitestConfig
} from './collectionConfig.mjs';
import { buildTestSuiteOwnershipReport } from './routeOwnership.mjs';

export function auditRepositoryTestSuiteOwnership({
  cwd = process.cwd(),
  runGit,
  lstat,
  readFile = readFileSync
} = {}) {
  const files = listGitVisibleTestFiles({ cwd, runGit, lstat });
  const sources = new Map(
    files.map((file) => [file, readUtf8(readFile(path.resolve(cwd, ...file.split('/'))), file)])
  );
  const vitestConfigs = Object.fromEntries(
    Object.entries(VITEST_CONFIG_PATHS).map(([kind, file]) => [
      kind,
      parseVitestConfig(readUtf8(readFile(path.resolve(cwd, file)), file), file)
    ])
  );
  const playwrightConfigs = new Map(
    PLAYWRIGHT_CONFIG_PATHS.map((file) => [
      file,
      parsePlaywrightConfig(readUtf8(readFile(path.resolve(cwd, file)), file), file)
    ])
  );
  const packageJson = JSON.parse(
    readUtf8(readFile(path.resolve(cwd, 'package.json')), 'package.json')
  );

  return buildTestSuiteOwnershipReport({
    files,
    sources,
    unitShards: createUnitTestShards(),
    e2eShards: createE2eTestShards(),
    browserSuites: createBrowserTestShardSuites(),
    packageScripts: packageJson.scripts ?? {},
    vitestConfigs,
    playwrightConfigs
  });
}

export function formatTestSuiteOwnershipReport(report) {
  const lines = [
    'Canonical test suite ownership report',
    `inventory=${report.counts.inventory} runnable=${report.counts.runnable} classified=${report.counts.classified} owned=${report.counts.owned} zeroOwner=${report.counts.zeroOwner} multipleOwner=${report.counts.multipleOwner}`
  ];
  for (const file of report.zeroOwner) {
    lines.push(`ZERO_OWNER ${JSON.stringify(file)}`);
  }
  for (const row of report.multipleOwners) {
    lines.push(`MULTIPLE_OWNER ${JSON.stringify(row.file)} ${JSON.stringify(row.owners)}`);
  }
  for (const row of report.emptyPatterns) {
    lines.push(
      `EMPTY_PATTERN ${JSON.stringify(`${row.kind}:${row.shard}`)} ${JSON.stringify(row.pattern)}`
    );
  }
  for (const row of report.missingRouteMembers) {
    lines.push(`MISSING_ROUTE_MEMBER ${JSON.stringify(row.route)} ${JSON.stringify(row.file)}`);
  }
  for (const row of report.duplicateRouteMembers) {
    lines.push(`DUPLICATE_ROUTE_MEMBER ${JSON.stringify(row.route)} ${JSON.stringify(row.file)}`);
  }
  for (const failure of report.invalidDescriptors) {
    lines.push(`INVALID_DESCRIPTOR ${JSON.stringify(failure)}`);
  }
  for (const file of report.unclassifiedModules) {
    lines.push(`UNCLASSIFIED ${JSON.stringify(file)}`);
  }
  lines.push(report.ok ? 'STATUS PASS' : 'STATUS FAIL');
  return `${lines.join('\n')}\n`;
}
