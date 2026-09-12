import { parseManagedCommandInvocationArgv } from './config/commandBoundaryProfiles.mjs';
import { runTaskGraph } from './utils/taskGraphRunner.mjs';

const quick = (id, name, script, dependsOn) =>
  task(id, name, 'npm-script-quick-v1', [script], dependsOn);
const standard = (id, name, script, dependsOn) =>
  task(id, name, 'npm-script-standard-v1', [script], dependsOn);

export function createQualityTaskGraph() {
  return {
    policyId: 'quality-v1',
    tasks: [
      quick('verify-runtime', 'Runtime engine 守卫', 'verify:runtime', []),
      quick(
        'release-metadata-check',
        'Release metadata source-of-truth 守卫',
        'release:metadata:check'
      ),
      standard('audit-ui-architecture-report', 'UI 架构迁移守卫', 'audit:ui-architecture:report'),
      standard(
        'audit-ui-production-ownership-check',
        'UI production ownership 守卫',
        'audit:ui-production-ownership:check'
      ),
      standard('audit-components-report', '组件入口统一守卫', 'audit:components:report'),
      standard(
        'audit-content-css-packs-check',
        'Content CSS packs 守卫',
        'audit:content-css-packs:check',
        ['build-fast']
      ),
      standard(
        'audit-compatibility-duplicates-check',
        '兼容壳重复审计',
        'audit:compatibility-duplicates:check'
      ),
      standard(
        'audit-design-system-doc-report',
        '设计系统文档真值守卫',
        'audit:design-system-doc:report'
      ),
      standard(
        'audit-design-tokens-check',
        'Design token alignment 守卫',
        'audit:design-tokens:check'
      ),
      standard(
        'audit-active-documents-check',
        'Active document contract 守卫',
        'audit:active-documents:check'
      ),
      standard(
        'audit-interaction-contract-report',
        '交互约定守卫',
        'audit:interaction-contract:report'
      ),
      standard(
        'audit-options-mainline-report',
        'Options 主链守卫',
        'audit:options-mainline:report'
      ),
      quick('report-options-legacy', 'Options 旧前缀扫描', 'report:options-legacy'),
      task('lint-css', 'Options/onboarding/UI CSS 命名校验', 'stylelint-v1', [
        'src/options/**/*.css',
        'src/onboarding/**/*.css',
        'src/ui/**/*.css'
      ]),
      standard('lint-hardcoded', 'Hardcoded config 守卫', 'lint:hardcoded'),
      standard('typecheck-app', 'TypeScript 类型检查（应用代码）', 'typecheck:app'),
      standard('typecheck-tests', 'TypeScript 类型检查（测试代码）', 'typecheck:tests'),
      standard('typecheck-strict', 'TypeScript 类型检查（strict 基线）', 'typecheck:strict'),
      quick('lint-type-any-ratchet', 'TypeScript 类型债务预算守卫', 'lint:type-any:ratchet'),
      standard('audit-ga-proxy-contract', 'GA proxy contract 守卫', 'audit:ga:proxy-contract'),
      standard('audit-ga-docs', 'GA docs contract 守卫', 'audit:ga:docs', [
        'audit-ga-proxy-contract'
      ]),
      standard('audit-ga-legacy-api', 'GA legacy API 守卫', 'audit:ga:legacy-api'),
      standard(
        'audit-platform-services-report',
        '平台调用 allowlist 审计',
        'audit:platform-services:report'
      ),
      standard('audit-imports-report', '深层导入边界审计', 'audit:imports:report'),
      standard('audit-retired-code-report', 'Retired code 回归守卫', 'audit:retired-code:report'),
      standard(
        'audit-production-shape-report',
        'Production shape 守卫',
        'audit:production-shape:report'
      ),
      standard(
        'audit-performance-report',
        'Performance hotspot budget 守卫',
        'audit:performance:report'
      ),
      quick('audit-ci-workflow-check', 'CI workflow 拓扑守卫', 'audit:ci-workflow:check'),
      standard(
        'audit-github-actions-supply-chain-check',
        'GitHub Actions immutable dependency guard',
        'audit:github-actions-supply-chain:check'
      ),
      standard(
        'audit-test-suite-ownership-check',
        'Test suite canonical owner guard',
        'audit:test-suite-ownership:check'
      ),
      standard(
        'audit-chrome-webstore-release-check',
        'Chrome Web Store GA 发布流程守卫',
        'audit:chrome-webstore-release:check'
      ),
      standard(
        'audit-build-graph-report',
        'Production build graph 守卫',
        'audit:build-graph:report'
      ),
      task(
        'audit-hardcoded-user-copy-check',
        'i18n hardcoded user-copy 守卫',
        'node-script-standard-v1',
        ['scripts/audit-i18n-hardcoded-user-copy.mjs', '--check'],
        ['audit-build-graph-report']
      ),
      task(
        'uncatalogued-user-copy-check',
        'i18n uncatalogued English user-copy 守卫',
        'node-script-standard-v1',
        ['scripts/audit-i18n-uncatalogued-user-copy.mjs', '--check'],
        ['audit-hardcoded-user-copy-check']
      ),
      standard(
        'audit-non-production-source-check',
        'Non-production source 安全守卫',
        'audit:non-production-source:check',
        ['audit-build-graph-report']
      ),
      task('build-fast', 'Release surface 生产构建', 'npm-script-build-v1', ['build:fast']),
      standard(
        'audit-release-surface-report',
        'Release surface 守卫',
        'audit:release-surface:report',
        ['build-fast']
      ),
      standard('audit-ga-client-secret', 'GA client secret 守卫', 'audit:ga:client-secret', [
        'build-fast'
      ]),
      standard('audit-ga-release-surface', 'GA release surface 守卫', 'audit:ga:release-surface', [
        'build-fast'
      ]),
      task('audit-deps-report', 'Dependency graph 覆盖守卫', 'dependency-cruiser-v1', []),
      standard('lint-warnings-guard', 'Lint Warning 基线守卫', 'lint:warnings-guard'),
      standard('i18n-catalog-check', 'i18n catalog 生成一致性守卫', 'i18n:catalog:check'),
      standard('i18n-lint', 'i18n 消息一致性校验', 'i18n:lint'),
      quick('validate-i18n-budgets', '字符预算校验', 'validate:i18n:budgets'),
      standard('audit-locales-report', 'Locale source alignment 守卫', 'audit:locales:report')
    ]
  };
}

function task(id, name, profile, args, dependsOn) {
  return {
    id,
    name,
    profile,
    args,
    dependsOn: id === 'verify-runtime' ? [] : (dependsOn ?? ['verify-runtime'])
  };
}

export async function runQualityChecks(options = {}) {
  const graph = createQualityTaskGraph();
  const result = await runTaskGraph(graph.tasks, { policyId: graph.policyId, ...options });
  if (!result.ok) {
    const failures = result.failed.map((failure) => failure.name).join(', ');
    console.error(`❌ 质量检查失败: ${failures}`);
  } else {
    console.log('🎉 质量检查全部通过');
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  parseManagedCommandInvocationArgv([
    'node',
    'scripts/quality-check.mjs',
    ...process.argv.slice(2)
  ]);
  const result = await runQualityChecks();
  if (!result.ok) process.exitCode = result.failed[0]?.code ?? 1;
}
