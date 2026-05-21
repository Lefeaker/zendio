import fs from 'node:fs/promises';
import path from 'node:path';
import { runLint, buildWarningSummary } from './utils/lintWarnings.mjs';

const ROOT_DIR = path.resolve(new URL('..', import.meta.url).pathname);
const BASELINE_DIR = path.join(ROOT_DIR, 'tools', 'baselines');
const QUALITY_TMP_DIR = path.join(ROOT_DIR, 'tmp', 'quality');
const LINT_REPORT_PATH = path.join(QUALITY_TMP_DIR, 'lint-report.latest.json');
const SUMMARY_PATH = path.join(BASELINE_DIR, 'lint-warnings.json');

async function writeLintOutputs(eslint, results) {
  await fs.mkdir(QUALITY_TMP_DIR, { recursive: true });

  const stylishFormatter = await eslint.loadFormatter('stylish');
  const stylishOutput = await stylishFormatter.format(results);
  if (stylishOutput.trim().length > 0) {
    console.log(stylishOutput);
  }

  const jsonFormatter = await eslint.loadFormatter('json');
  const jsonOutput = await jsonFormatter.format(results);
  await fs.writeFile(LINT_REPORT_PATH, jsonOutput);
}

async function generateReport() {
  console.log('📊 正在生成 lint 告警快照...');
  const { eslint, results } = await runLint();
  await writeLintOutputs(eslint, results);

  const summary = buildWarningSummary(results);
  await fs.mkdir(BASELINE_DIR, { recursive: true });
  await fs.writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  console.log(
    `✅ 生成完成：${summary.totalWarnings} 条 warning 已写入 tools/baselines/lint-warnings.json`
  );

  const hasErrors = results.some((result) => result.errorCount > 0 || result.fatalErrorCount > 0);
  if (hasErrors) {
    console.error('❌ 存在 ESLint error，请先修复后再更新基线。');
    process.exitCode = 1;
  }
}

await generateReport();
