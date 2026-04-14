import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIST_DIR = join(ROOT, 'build', 'dist');
const REPORTS_DIR = join(ROOT, 'build', 'reports');
const RELEASE_MD = join(REPORTS_DIR, 'release-summary.md');
const RELEASE_JSON = join(REPORTS_DIR, 'release-summary.json');

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function safeStat(path) {
  return existsSync(path) ? statSync(path) : null;
}

function collectEntrySizes() {
  const entries = [
    ['content/index', join(DIST_DIR, 'content', 'index.js')],
    ['content/runtime', join(DIST_DIR, 'content', 'runtime.js')],
    ['options/index', join(DIST_DIR, 'options', 'index.js')],
    ['onboarding/index', join(DIST_DIR, 'onboarding', 'index.js')]
  ];
  return entries.map(([name, path]) => ({
    name,
    path,
    size: safeStat(path)?.size ?? null
  }));
}

function collectChunks() {
  const chunksDir = join(DIST_DIR, 'chunks');
  if (!existsSync(chunksDir)) {
    return [];
  }
  return readdirSync(chunksDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, size: statSync(join(chunksDir, file)).size }))
    .sort((a, b) => b.size - a.size);
}

function readVersion() {
  const manifestPath = join(DIST_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return null;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return {
    name: manifest.name ?? 'all-in-ob',
    version: manifest.version ?? 'unknown'
  };
}

if (!existsSync(DIST_DIR)) {
  console.error(
    'build/dist does not exist. Run the release pipeline after build/test/audit steps.'
  );
  process.exit(1);
}

mkdirSync(REPORTS_DIR, { recursive: true });

const meta = readVersion();
const entrySizes = collectEntrySizes();
const chunks = collectChunks();
const topChunks = chunks.slice(0, 10);
const localeChunks = chunks.filter(({ file }) =>
  /^(?:qps-ploc|en|zh-CN|zh-TW|ja|ko|fr|de|ru|it|es-ES|es-419|pt-BR)-/.test(file)
);
const summary = {
  generatedAt: new Date().toISOString(),
  package: meta,
  entries: entrySizes,
  chunkCount: chunks.length,
  topChunks,
  localeChunks: localeChunks.slice(0, 10),
  prerequisites: [
    'typecheck',
    'lint',
    'test:unit',
    'test:e2e',
    'test:e2e:browser',
    'test:e2e:browser:smoke',
    'audit:ui-architecture:report',
    'audit:interaction-contract:report',
    'audit:build:report',
    'audit:performance:report'
  ]
};

const markdown = [
  '# 发布前摘要报告',
  '',
  `- 生成时间：${summary.generatedAt}`,
  `- 扩展：${meta?.name ?? 'unknown'} ${meta?.version ?? ''}`.trim(),
  `- 前置口径：${summary.prerequisites.join(' / ')}`,
  '',
  '## 入口体积',
  '',
  ...entrySizes.map(
    ({ name, size }) => `- ${name}: ${size === null ? 'missing' : formatSize(size)}`
  ),
  '',
  `## Chunk 概况`,
  '',
  `- 总 chunk 数：${chunks.length}`,
  ...topChunks.map(({ file, size }) => `- ${file}: ${formatSize(size)}`),
  '',
  '## Locale Chunk',
  '',
  ...(localeChunks.length
    ? localeChunks.slice(0, 10).map(({ file, size }) => `- ${file}: ${formatSize(size)}`)
    : ['- 无独立 locale chunk 或尚未生成']),
  '',
  '## 说明',
  '',
  '- 本报告只在构建产物与审计完成后生成，用于发布前快速查看体积与高风险 chunk。',
  '- 若需要完整状态，请结合 CI 日志与 build/reports 下其他审计输出一起查看。',
  ''
].join('\n');

writeFileSync(RELEASE_MD, markdown);
writeFileSync(RELEASE_JSON, JSON.stringify(summary, null, 2));
console.log(`Release summary written to ${RELEASE_MD}`);
