import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ROOT = process.env.AIIOB_DESIGN_SYSTEM_DOC_ROOT ?? process.cwd();
const GOVERNANCE_DOC_PATH = 'docs/design-system-governance.md';
const OWNERSHIP_MANIFEST_PATH = 'tools/ui-production-ownership.json';

const REQUIRED_HEADINGS = [
  '## 1. 当前正式入口',
  '## 2. 组件分层规则',
  '## 3. 命名与交互现状',
  '## 4. 样式与 Token 真值',
  '## 5. 迁移期兼容层与归档资产',
  '## 6. 持续守门'
];

const REQUIRED_REFERENCES = [
  'tools/ui-production-ownership.json',
  'src/styles/design-tokens.css',
  'src/ui/foundation/icons/index.ts',
  'src/ui/primitives/button/index.ts',
  'src/ui/stitch-runtime/index.ts',
  'src/ui/stitch-surfaces/index.ts',
  'docs/archive/legacy-options-assets/obsidian-hybrid-preview.html'
];

const REQUIRED_PHRASES = [
  'legacy wrapper',
  'legacy-options-assets',
  'audit:ui-architecture:report',
  'lucide'
];

const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.sh']);
const SKIPPED_ROOT_DIRECTORIES = new Set([
  '.git',
  '.tmp',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
  'tmp'
]);

function normalizePath(value) {
  return value.split('\\').join('/');
}

async function listFiles(dir, { skipRootDirectories = false } = {}) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (skipRootDirectories && entry.isDirectory() && SKIPPED_ROOT_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listFiles(fullPath)));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    return files;
  } catch {
    return [];
  }
}

function filterGitIgnored(repoRoot, files) {
  if (!files.length) {
    return files;
  }
  const result = spawnSync('git', ['-C', repoRoot, 'check-ignore', '--stdin'], {
    input: `${files.join('\n')}\n`,
    encoding: 'utf8'
  });
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    return files;
  }
  const ignored = new Set(
    result.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((file) => normalizePath(file))
  );
  return files.filter((file) => !ignored.has(file));
}

function isHistoricalStyleDoc(file) {
  return (
    file.startsWith('docs/archive/') ||
    file.startsWith('docs/screenshots/') ||
    file === 'docs/债务.md' ||
    /^docs\/final-acceptance-report-.*\.md$/.test(file) ||
    /^docs\/目标架构迁移.*\.md$/.test(file)
  );
}

async function collectActiveDocFiles(repoRoot) {
  const candidates = ['.dependency-cruiser.cjs', OWNERSHIP_MANIFEST_PATH];
  const repositoryFiles = await listFiles(repoRoot, { skipRootDirectories: true });
  for (const file of repositoryFiles) {
    if (extname(file) === '.md') {
      candidates.push(relative(repoRoot, file));
    }
  }
  const scripts = await listFiles(join(repoRoot, 'scripts'));
  for (const file of scripts) {
    if (SCRIPT_EXTENSIONS.has(extname(file))) {
      candidates.push(relative(repoRoot, file));
    }
  }

  const unique = filterGitIgnored(repoRoot, [
    ...new Set(candidates.map((file) => normalizePath(file)))
  ]);
  const existing = [];
  for (const file of unique) {
    if (isHistoricalStyleDoc(file)) {
      continue;
    }
    try {
      await access(join(repoRoot, file), constants.F_OK);
      existing.push(file);
    } catch {
      // Optional guidance inputs that are absent are not part of this tree.
    }
  }
  return existing.sort((left, right) => left.localeCompare(right));
}

function containsStyleKeyword(line) {
  return /\b(?:Tailwind|tailwind-baseline|DaisyUI|Daisy)\b|Daisy[A-Z]|daisy\//i.test(line);
}

function hasHistoricalCaveat(text) {
  return /historical|archive|archive-only|retired|legacy|compatibility|compat|fixture|not active|not current|not .*guidance|已退役|历史|归档|迁移追溯|不得|不要|不应|不存在|不包含|不执行|未恢复|禁止|退出|已删除|防止|不再|旧|仅作为|只作为/i.test(
    text
  );
}

async function findStaleStyleGuidance(repoRoot, files) {
  const findings = [];
  for (const file of files) {
    const source = await readFile(join(repoRoot, file), 'utf8');
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!containsStyleKeyword(line)) {
        return;
      }
      const context = lines
        .slice(Math.max(0, index - 5), Math.min(lines.length, index + 6))
        .join(' ');
      if (hasHistoricalCaveat(context) && !/tailwind-baseline/i.test(line)) {
        return;
      }
      findings.push({ path: file, line: index + 1, text: line.trim() });
    });
  }
  return findings;
}

function validateManifestReferences(manifest, referencedPaths) {
  const findings = [];
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    !['intermediate', 'final'].includes(manifest.closureState) ||
    !Array.isArray(manifest.rows)
  ) {
    return ['ownership manifest has an invalid shape'];
  }
  const paths = new Set(manifest.rows.map((row) => row?.path));
  for (const reference of referencedPaths) {
    if (reference.startsWith('src/ui/') && !paths.has(reference)) {
      findings.push(reference);
    }
  }
  if (
    manifest.closureState === 'final' &&
    manifest.rows.some(
      (row) =>
        row?.disposition !== 'production-runtime' && row?.disposition !== 'production-compile'
    )
  ) {
    findings.push('final ownership manifest still contains a non-production disposition');
  }
  return findings;
}

async function buildDesignSystemDocReport(repoRoot = DEFAULT_ROOT) {
  const docSource = await readFile(join(repoRoot, GOVERNANCE_DOC_PATH), 'utf8');
  const manifest = JSON.parse(await readFile(join(repoRoot, OWNERSHIP_MANIFEST_PATH), 'utf8'));
  const missingHeadings = REQUIRED_HEADINGS.filter((heading) => !docSource.includes(heading));
  const missingReferences = REQUIRED_REFERENCES.filter(
    (reference) => !docSource.includes(reference)
  );
  const missingPhrases = REQUIRED_PHRASES.filter((phrase) => !docSource.includes(phrase));
  const activeDocFiles = await collectActiveDocFiles(repoRoot);
  const staleGuidance = await findStaleStyleGuidance(repoRoot, activeDocFiles);
  const referencedPaths = [...docSource.matchAll(/`((?:src|docs|tools)\/[^`]+)`/g)].map(
    (match) => match[1]
  );
  const uniqueReferencedPaths = [...new Set(referencedPaths)].filter(
    (reference) => !/[*?\[\]{}]/.test(reference)
  );
  const missingFiles = [];
  for (const reference of uniqueReferencedPaths) {
    try {
      await access(join(repoRoot, reference), constants.F_OK);
    } catch {
      missingFiles.push(reference);
    }
  }
  const staleUiReferences = validateManifestReferences(manifest, uniqueReferencedPaths);
  return {
    activeDocFiles,
    missingFiles,
    missingHeadings,
    missingPhrases,
    missingReferences,
    staleGuidance,
    staleUiReferences,
    uniqueReferencedPaths
  };
}

function printReport(report) {
  console.log(
    `Required headings present: ${REQUIRED_HEADINGS.length - report.missingHeadings.length}/${REQUIRED_HEADINGS.length}`
  );
  console.log(
    `Required references present: ${REQUIRED_REFERENCES.length - report.missingReferences.length}/${REQUIRED_REFERENCES.length}`
  );
  console.log(
    `Required phrases present: ${REQUIRED_PHRASES.length - report.missingPhrases.length}/${REQUIRED_PHRASES.length}`
  );
  console.log(`Referenced paths checked: ${report.uniqueReferencedPaths.length}`);
  console.log(`Missing referenced files: ${report.missingFiles.length}`);
  console.log(`Manifest-stale UI references: ${report.staleUiReferences.length}`);
  console.log(`Active style guidance files checked: ${report.activeDocFiles.length}`);
  console.log(`Stale current-style guidance findings: ${report.staleGuidance.length}`);

  const sections = [
    ['Missing headings:', report.missingHeadings],
    ['Missing required references in document:', report.missingReferences],
    ['Missing required phrases in document:', report.missingPhrases],
    ['Document references missing files:', report.missingFiles],
    ['Document references UI paths absent from the ownership manifest:', report.staleUiReferences]
  ];
  for (const [heading, values] of sections) {
    if (values.length === 0) {
      continue;
    }
    console.log(`\n${heading}`);
    values.forEach((value) => console.log(`- ${value}`));
  }
  if (report.staleGuidance.length > 0) {
    console.log('\nStale current-style guidance:');
    report.staleGuidance.forEach((finding) =>
      console.log(`- ${finding.path}:${finding.line}: ${finding.text}`)
    );
  }
}

async function main() {
  const report = await buildDesignSystemDocReport();
  printReport(report);
  if (
    report.missingHeadings.length ||
    report.missingReferences.length ||
    report.missingPhrases.length ||
    report.missingFiles.length ||
    report.staleUiReferences.length ||
    report.staleGuidance.length
  ) {
    process.exitCode = 1;
  }
}

export {
  buildDesignSystemDocReport,
  collectActiveDocFiles,
  findStaleStyleGuidance,
  isHistoricalStyleDoc,
  validateManifestReferences
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
