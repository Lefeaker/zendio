import fs from 'node:fs/promises';
import path from 'node:path';
import { runLint, buildWarningSummary, formatRuleDelta } from './utils/lintWarnings.mjs';

const ROOT_DIR = path.resolve(new URL('..', import.meta.url).pathname);
const BASELINE_PATH = path.join(ROOT_DIR, 'lint-warnings.json');
const TMP_DIR = path.join(ROOT_DIR, 'tmp');
const TMP_REPORT_PATH = path.join(TMP_DIR, 'lint-report.latest.json');
const TMP_SUMMARY_PATH = path.join(TMP_DIR, 'lint-warnings.latest.json');

async function persistLatestArtifacts(eslint, results, summary) {
  await fs.mkdir(TMP_DIR, { recursive: true });

  const jsonFormatter = await eslint.loadFormatter('json');
  const jsonOutput = await jsonFormatter.format(results);
  await fs.writeFile(TMP_REPORT_PATH, jsonOutput);
  await fs.writeFile(TMP_SUMMARY_PATH, JSON.stringify(summary, null, 2));
}

async function guardWarnings() {
  console.log('🛡️  正在执行 lint warning 基线守卫...');
  const baseline = JSON.parse(await fs.readFile(BASELINE_PATH, 'utf8'));

  const { eslint, results } = await runLint();
  const summary = buildWarningSummary(results);

  await persistLatestArtifacts(eslint, results, summary);

  const hasErrors = results.some((result) => result.errorCount > 0 || result.fatalErrorCount > 0);
  if (hasErrors) {
    console.error('❌ 存在 ESLint error，请先修复 error 再提交。');
    process.exit(1);
  }

  const totalDelta = summary.totalWarnings - (baseline.totalWarnings ?? 0);
  const ruleDeltas = formatRuleDelta(summary, baseline);

  if (totalDelta > 0 || ruleDeltas.length > 0) {
    console.error('❌ Lint warning 数量超过基线限制，阻断本次提交。');
    if (totalDelta > 0) {
      console.error(`   • 警告总数增加 ${totalDelta} 条（基线 ${baseline.totalWarnings}, 当前 ${summary.totalWarnings}）`);
    }
    if (ruleDeltas.length > 0) {
      console.error('   • 以下规则出现新增：');
      for (const delta of ruleDeltas) {
        console.error(`     - ${delta.ruleId}: +${delta.delta}（基线 ${delta.baseline} → 当前 ${delta.current}）`);
      }
    }
    console.error(`   • 最新报告已写入 ${path.relative(process.cwd(), TMP_SUMMARY_PATH)}`);
    process.exit(1);
  }

  const improvement = -totalDelta;
  if (improvement > 0) {
    console.log(`✅ Warning 总量下降 ${improvement} 条（现在 ${summary.totalWarnings} 条）`);
  } else {
    console.log(`✅ Warning 总量保持在基线 ${summary.totalWarnings} 条`);
  }
}

await guardWarnings();
