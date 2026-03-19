import { ESLint } from 'eslint';
import path from 'node:path';

const LINT_TARGETS = ['src', 'tests'];
const LINT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

export async function runLint() {
  const eslint = new ESLint({
    extensions: LINT_EXTENSIONS
  });

  const results = await eslint.lintFiles(LINT_TARGETS);
  return { eslint, results };
}

export function buildWarningSummary(results) {
  const summary = {
    totalWarnings: 0,
    ruleCounts: {},
    files: []
  };

  for (const result of results) {
    const fileWarnings = result.messages.filter((message) => message.severity === 1);
    if (fileWarnings.length === 0) {
      continue;
    }

    summary.totalWarnings += fileWarnings.length;
    const formattedWarnings = fileWarnings.map((warning) => {
      const ruleId = warning.ruleId ?? 'unknown-rule';
      summary.ruleCounts[ruleId] = (summary.ruleCounts[ruleId] ?? 0) + 1;

      return {
        line: warning.line,
        column: warning.column,
        ruleId,
        message: warning.message
      };
    });

    summary.files.push({
      file: toRelativePath(result.filePath),
      warnings: formattedWarnings
    });
  }

  summary.files.sort((a, b) => a.file.localeCompare(b.file, 'en'));
  return summary;
}

export function formatRuleDelta(current, baseline) {
  const deltas = [];
  const mergedRules = new Set([...Object.keys(current.ruleCounts), ...Object.keys(baseline.ruleCounts ?? {})]);

  for (const ruleId of mergedRules) {
    const currentCount = current.ruleCounts[ruleId] ?? 0;
    const baselineCount = baseline.ruleCounts?.[ruleId] ?? 0;
    const delta = currentCount - baselineCount;
    if (delta > 0) {
      deltas.push({ ruleId, delta, baseline: baselineCount, current: currentCount });
    }
  }

  return deltas;
}

function toRelativePath(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  return relativePath.startsWith('..') ? filePath : relativePath || filePath;
}
