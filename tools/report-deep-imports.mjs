import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const targetDir = join(root, 'src');
const deepImportPattern = /from\s+['"]((?:\.\.\/){3,}[^'"]*)['"]/g;

async function collectFiles(dir) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = await collectFiles(targetDir);
const findings = [];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(deepImportPattern)) {
    const before = source.slice(0, match.index);
    const line = before.split('\n').length;
    findings.push({
      file: file.replace(`${root}/`, ''),
      line,
      importPath: match[1]
    });
  }
}

if (findings.length === 0) {
  console.log('No deep relative imports found.');
  process.exit(0);
}

for (const finding of findings) {
  console.log(`${finding.file}:${finding.line} ${finding.importPath}`);
}
