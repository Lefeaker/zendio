import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
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

if (
  missingHeadings.length ||
  missingReferences.length ||
  missingPhrases.length ||
  missingFiles.length
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
  }

  process.exitCode = 1;
}
