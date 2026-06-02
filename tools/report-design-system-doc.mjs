import { access, readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.env.AIIOB_DESIGN_SYSTEM_DOC_ROOT ?? process.cwd();
const docPath = join(root, 'docs/design-system-governance.md');
const docSource = await readFile(docPath, 'utf8');

const requiredHeadings = [
  '## 1. 当前正式入口',
  '## 2. 组件分层规则',
  '## 3. 命名与交互现状',
  '## 4. 样式与 Token 真值',
  '## 5. 迁移期兼容层与归档资产',
  '## 6. 持续守门'
];

const requiredReferences = [
  'src/ui/foundation/tokens/index.ts',
  'src/ui/foundation/icons/index.ts',
  'src/ui/primitives/button/index.ts',
  'src/ui/primitives/layout/index.ts',
  'src/ui/patterns/section-shell/index.ts',
  'src/ui/hosts/shadow/index.ts',
  'src/ui/domains/vault-router/index.ts',
  'docs/archive/legacy-options-assets/obsidian-hybrid-preview.html'
];

const requiredPhrases = [
  'legacy wrapper',
  'legacy-options-assets',
  'audit:ui-architecture:report',
  'lucide'
];

const missingHeadings = requiredHeadings.filter((heading) => !docSource.includes(heading));
const missingReferences = requiredReferences.filter((reference) => !docSource.includes(reference));
const missingPhrases = requiredPhrases.filter((phrase) => !docSource.includes(phrase));

const activeDocFiles = await collectActiveDocFiles(root);
const staleGuidance = await findStaleStyleGuidance(root, activeDocFiles);

const referencedPaths = [...docSource.matchAll(/`((?:src|docs)\/[^`]+)`/g)].map(
  (match) => match[1]
);
const uniqueReferencedPaths = [...new Set(referencedPaths)].filter((reference) => !reference.includes('*'));

const missingFiles = [];
for (const reference of uniqueReferencedPaths) {
  try {
    await access(join(root, reference), constants.F_OK);
  } catch {
    missingFiles.push(reference);
  }
}

console.log(
  `Required headings present: ${requiredHeadings.length - missingHeadings.length}/${requiredHeadings.length}`
);
console.log(
  `Required references present: ${requiredReferences.length - missingReferences.length}/${requiredReferences.length}`
);
console.log(
  `Required phrases present: ${requiredPhrases.length - missingPhrases.length}/${requiredPhrases.length}`
);
console.log(`Referenced paths checked: ${uniqueReferencedPaths.length}`);
console.log(`Missing referenced files: ${missingFiles.length}`);
console.log(`Active style guidance files checked: ${activeDocFiles.length}`);
console.log(`Stale current-style guidance findings: ${staleGuidance.length}`);

if (
  missingHeadings.length ||
  missingReferences.length ||
  missingPhrases.length ||
  missingFiles.length ||
  staleGuidance.length
) {
  console.log('');

  if (missingHeadings.length) {
    console.log('Missing headings:');
    for (const heading of missingHeadings) {
      console.log(`- ${heading}`);
    }
    console.log('');
  }

  if (missingReferences.length) {
    console.log('Missing required references in document:');
    for (const reference of missingReferences) {
      console.log(`- ${reference}`);
    }
    console.log('');
  }

  if (missingPhrases.length) {
    console.log('Missing required phrases in document:');
    for (const phrase of missingPhrases) {
      console.log(`- ${phrase}`);
    }
    console.log('');
  }

  if (missingFiles.length) {
    console.log('Document references missing files:');
    for (const file of missingFiles) {
      console.log(`- ${file}`);
    }
    console.log('');
  }

  if (staleGuidance.length) {
    console.log('Stale current-style guidance:');
    for (const finding of staleGuidance) {
      console.log(`- ${finding.path}:${finding.line}: ${finding.text}`);
    }
  }

  process.exitCode = 1;
}

async function collectActiveDocFiles(repoRoot) {
  const candidates = [
    '.github/PULL_REQUEST_TEMPLATE.md',
    'AGENTS.md',
    'README.md',
    'src/options/README.md',
    'src/options/components/README.md'
  ];

  const docs = await listFiles(join(repoRoot, 'docs'));
  for (const file of docs) {
    if (extname(file) === '.md') {
      candidates.push(relative(repoRoot, file));
    }
  }

  const scripts = await listFiles(join(repoRoot, 'scripts'));
  for (const file of scripts) {
    const extension = extname(file);
    if (['.js', '.mjs', '.cjs', '.ts', '.mts', '.sh'].includes(extension)) {
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
      // Missing optional documentation files are covered by source-of-truth docs, not this scan.
    }
  }
  return existing;
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

async function listFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
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

async function findStaleStyleGuidance(repoRoot, files) {
  const findings = [];
  for (const file of files) {
    const source = await readFile(join(repoRoot, file), 'utf8');
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!containsStyleKeyword(line)) {
        return;
      }
      const context = lines.slice(Math.max(0, index - 5), Math.min(lines.length, index + 6)).join(' ');
      if (hasHistoricalCaveat(context) && !/tailwind-baseline/i.test(line)) {
        return;
      }
      findings.push({
        path: file,
        line: index + 1,
        text: line.trim()
      });
    });
  }
  return findings;
}

function containsStyleKeyword(line) {
  return /\b(?:Tailwind|tailwind-baseline|DaisyUI|Daisy)\b|Daisy[A-Z]|daisy\//i.test(line);
}

function hasHistoricalCaveat(text) {
  return /historical|archive|archive-only|retired|legacy|compatibility|compat|not active|not current|not .*guidance|已退役|历史|归档|迁移追溯|不得|不要|不应|不存在|不包含|不执行|未恢复|禁止|退出|已删除|防止|不再|旧|仅作为|只作为/i.test(
    text
  );
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

function normalizePath(path) {
  return path.split('\\').join('/');
}
