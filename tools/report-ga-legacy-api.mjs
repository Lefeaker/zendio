#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

const isCheckMode = process.argv.includes('--check');
const allowedPaths = new Set(['src/shared/types/analytics.ts']);
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const legacyPatterns = [
  {
    label: 'deprecated createTrackUsageEventMessage usage',
    regex: /\bcreateTrackUsageEventMessage\b/g
  },
  {
    label: 'raw TRACK_USAGE_EVENT runtime payload',
    regex: /type\s*:\s*['"]TRACK_USAGE_EVENT['"]/g
  },
  {
    label: "raw legacy type:'track' runtime payload",
    regex: /type\s*:\s*['"]track['"]/g
  }
];

function listSourceFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function findLineAndColumn(source, index) {
  let line = 1;
  let column = 1;

  for (let i = 0; i < index; i += 1) {
    if (source[i] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

function lineAt(source, line) {
  return source.split('\n')[line - 1]?.trim() ?? '';
}

const findings = [];

for (const filePath of listSourceFiles(srcDir)) {
  const relativePath = path.relative(rootDir, filePath).replaceAll(path.sep, '/');
  if (allowedPaths.has(relativePath)) {
    continue;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  for (const { label, regex } of legacyPatterns) {
    regex.lastIndex = 0;
    for (const match of source.matchAll(regex)) {
      const index = match.index ?? 0;
      const { line, column } = findLineAndColumn(source, index);
      findings.push({
        relativePath,
        line,
        column,
        label,
        snippet: lineAt(source, line)
      });
    }
  }
}

if (findings.length === 0) {
  console.log('No legacy production analytics API usage found in src/.');
  process.exit(0);
}

console.log(`Found ${findings.length} legacy analytics API occurrence(s) in src/:`);
for (const finding of findings) {
  console.log(
    `- ${finding.relativePath}:${finding.line}:${finding.column} ${finding.label}\n  ${finding.snippet}`
  );
}

if (isCheckMode) {
  process.exit(1);
}
