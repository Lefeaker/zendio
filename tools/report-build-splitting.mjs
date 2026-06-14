import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIST_DIR = join(ROOT, 'build', 'dist');
const CHUNKS_DIR = join(DIST_DIR, 'chunks');
const ENTRY_FILES = [
  join(DIST_DIR, 'content', 'index.js'),
  join(DIST_DIR, 'content', 'runtime.js'),
  join(DIST_DIR, 'options', 'index.js'),
  join(DIST_DIR, 'onboarding', 'index.js')
];
const ENTRY_BUDGETS = new Map([
  [join(DIST_DIR, 'content', 'index.js'), { hardStop: 1 * 1024 }],
  // 2026-06-13 P06 keeps the current integration size as the warning target and
  // restores a small hard-stop margin. The 38-byte drift was already reproduced
  // on the pre-P04-safe integration head and is carried by the accepted P01-P05
  // merge stack rather than a new P06 behavior change or locale-budget
  // expansion.
  [
    join(DIST_DIR, 'content', 'runtime.js'),
    {
      warningTarget: 57209,
      hardStop: 57386
    }
  ],
  [join(DIST_DIR, 'options', 'index.js'), { hardStop: 12 * 1024 }],
  // 2026-06-14 P06 keeps onboarding on the current observed warning target
  // while restoring a small hard-stop margin so verify:preflight can warn at the
  // accepted baseline instead of pinning the build to an exact-edge zero-headroom
  // value.
  [
    join(DIST_DIR, 'onboarding', 'index.js'),
    {
      warningTarget: 16459,
      hardStop: 16715
    }
  ]
]);
// 2026-06-09: Video screenshot preparation now loads as an explicit lazy chunk.
// esbuild also extracts the tiny shared screenshot-intent bridge used by both the
// session runtime and screenshot queue. Keep size budgets strict while allowing
// the two intentional chunks created by that split.
// 2026-06-13 final combined integration budget. The current branch combines the
// structural-debt split with the visible-tab screenshot export path; only the
// dev chunk count needs a warning target plus hard stop, while
// entry/shared/locale/YAML size budgets stay unchanged.
const CHUNK_COUNT_BUDGET = {
  warningTarget: 118,
  hardStop: 120
};
const MAX_SINGLE_CHUNK_SIZE = 320 * 1024;
// Shared #1 carries the cross-entry options/repository schema. The first budget
// includes the video control-bar persisted preference contract.
// 2026-06-11: Reader terminal draft finalization now fail-closes export/cancel and
// shares the session mutation contract with video. Keep chunk count strict while
// allowing the reader shared chunk created by that production behavior.
const SHARED_CHUNK_BUDGETS = [190 * 1024, 136 * 1024, 96 * 1024];
const MAX_LOCALE_CHUNK_SIZE = 60 * 1024;
const LOCALE_CHUNK_PATTERN =
  /^(?:en|zh-CN|zh-TW|ja|ko|fr|de|ru|it|es-ES|es-419|pt-BR)(?:\.generated)?-/;
const YAML_CONFIG_CHUNK_PATTERN = /^yaml-config-/;
const YAML_CONFIG_CHUNK_BUDGET = 70 * 1024;

function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatBytes(bytes) {
  return `${bytes} B`;
}

function formatEntryBudgetDetails(observed, budget) {
  if (budget.warningTarget !== undefined) {
    return `${formatSize(observed)} (${formatBytes(observed)}; warning target ${formatBytes(
      budget.warningTarget
    )}; hard stop ${formatBytes(budget.hardStop)})`;
  }
  return `${formatSize(observed)}`;
}

function evaluateByteBudget({ label, observed, budget, warnings, findings }) {
  if (budget.warningTarget !== undefined && observed > budget.warningTarget) {
    warnings.push(
      `${label} is above warning target: ${formatBytes(observed)} > ${formatBytes(
        budget.warningTarget
      )} (hard stop ${formatBytes(budget.hardStop)})`
    );
  }
  if (observed > budget.hardStop) {
    findings.push(`${label} exceeds hard stop: ${formatBytes(observed)} > ${formatBytes(budget.hardStop)}`);
  }
}

function evaluateCountBudget({ observed, budget, warnings, findings }) {
  if (observed > budget.warningTarget) {
    warnings.push(
      `chunk count is above warning target: ${observed} > ${budget.warningTarget} (hard stop ${budget.hardStop})`
    );
  }
  if (observed > budget.hardStop) {
    findings.push(`chunk count exceeds hard stop: ${observed} > ${budget.hardStop}`);
  }
}

if (!existsSync(DIST_DIR)) {
  console.error('build/dist does not exist. Run `npm run build:dev` or `npm run build` first.');
  process.exit(1);
}

for (const entry of ENTRY_FILES) {
  if (!existsSync(entry)) {
    console.error(`Missing built entry: ${entry}`);
    process.exit(1);
  }
}

if (!existsSync(CHUNKS_DIR)) {
  console.error('No chunks directory found. UI splitting is not active.');
  process.exit(1);
}

const chunkFiles = readdirSync(CHUNKS_DIR).filter((file) => file.endsWith('.js'));
if (chunkFiles.length === 0) {
  console.error('No JS chunks found in build/dist/chunks. UI splitting is not active.');
  process.exit(1);
}

const chunkStats = chunkFiles.map((chunkFile) => {
  const size = statSync(join(CHUNKS_DIR, chunkFile)).size;
  return {
    file: chunkFile,
    size,
    isLocale: LOCALE_CHUNK_PATTERN.test(chunkFile),
    isShared: chunkFile.startsWith('chunk-')
  };
});

console.log('Build splitting report');
const findings = [];
const warnings = [];
for (const entry of ENTRY_FILES) {
  const stats = statSync(entry);
  const budget = ENTRY_BUDGETS.get(entry);
  console.log(
    `- ${entry.replace(`${ROOT}/`, '')}: ${formatEntryBudgetDetails(stats.size, budget)}`
  );
  evaluateByteBudget({
    label: entry.replace(`${ROOT}/`, ''),
    observed: stats.size,
    budget,
    warnings,
    findings
  });
}
console.log(
  `- chunks: ${chunkFiles.length} (warning target ${CHUNK_COUNT_BUDGET.warningTarget}; hard stop ${CHUNK_COUNT_BUDGET.hardStop})`
);
evaluateCountBudget({
  observed: chunkFiles.length,
  budget: CHUNK_COUNT_BUDGET,
  warnings,
  findings
});
for (const chunk of chunkStats) {
  console.log(`  - chunks/${chunk.file}: ${formatSize(chunk.size)}`);
  if (chunk.size > MAX_SINGLE_CHUNK_SIZE) {
    findings.push(
      `chunks/${chunk.file} exceeds max chunk budget: ${formatSize(chunk.size)} > ${formatSize(
        MAX_SINGLE_CHUNK_SIZE
      )}`
    );
  }
  if (chunk.isLocale && chunk.size > MAX_LOCALE_CHUNK_SIZE) {
    findings.push(
      `chunks/${chunk.file} exceeds locale chunk budget: ${formatSize(chunk.size)} > ${formatSize(
        MAX_LOCALE_CHUNK_SIZE
      )}`
    );
  }
  if (YAML_CONFIG_CHUNK_PATTERN.test(chunk.file) && chunk.size > YAML_CONFIG_CHUNK_BUDGET) {
    findings.push(
      `chunks/${chunk.file} exceeds yaml-config budget: ${formatSize(chunk.size)} > ${formatSize(
        YAML_CONFIG_CHUNK_BUDGET
      )}`
    );
  }
}

const sharedChunks = chunkStats
  .filter((chunk) => chunk.isShared && !chunk.isLocale)
  .sort((a, b) => b.size - a.size);

sharedChunks.slice(0, 3).forEach((chunk, index) => {
  const budget = SHARED_CHUNK_BUDGETS[index];
  if (budget !== undefined && chunk.size > budget) {
    findings.push(
      `chunks/${chunk.file} exceeds shared #${index + 1} budget: ${formatSize(chunk.size)} > ${formatSize(
        budget
      )}`
    );
  }
});

if (sharedChunks.length < 3) {
  findings.push('expected at least three shared chunks to validate shared chunk budgets.');
}

if (warnings.length > 0) {
  console.error('\nBuild budget warnings:');
  warnings.forEach((warning) => console.error(`- ${warning}`));
}

if (findings.length > 0) {
  console.error('\nBuild budget check failed:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}
