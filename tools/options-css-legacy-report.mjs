#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';

const ROOTS = ['src/options'];
const INCLUDED_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.html', '.css', '.scss']);

const IGNORE_PATHS = new Set(
  [
    'src/options/aob-option-preview.html',
    'docs/archive/legacy-options-assets/obsidian-hybrid-preview.html'
  ].map((p) => path.resolve(p))
);

const legacyMap = new Map();
const allTokens = new Set();
const IGNORED_NON_CLASS_TOKENS = new Set(['aob-theme']);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (IGNORE_PATHS.has(path.resolve(fullPath))) {
      continue;
    }
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!INCLUDED_EXTS.has(ext)) {
      continue;
    }
    const content = await fs.readFile(fullPath, 'utf8');
    collectTokens(content, fullPath, ext);
  }
}

function collectTokens(content, file, ext) {
  if (ext === '.css' || ext === '.scss') {
    collectCssTokens(content, file);
    return;
  }
  const regex = /\b(aobx?-[a-z0-9_-]+)\b/gi;
  for (const match of content.matchAll(regex)) {
    const token = match[1].toLowerCase();
    if (IGNORED_NON_CLASS_TOKENS.has(token)) {
      continue;
    }
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (content.slice(end, end + 4) === '.css') {
      continue;
    }
    allTokens.add(token);
    if (!token.startsWith('aob-')) {
      continue;
    }
    trackLegacy(token, file);
  }
}

function collectCssTokens(content, file) {
  const regex = /\.((?:aobx?-[a-z0-9_-]+))/gi;
  for (const match of content.matchAll(regex)) {
    const token = match[1].toLowerCase();
    allTokens.add(token);
    if (!token.startsWith('aob-')) {
      continue;
    }
    trackLegacy(token, file);
  }
}

function trackLegacy(token, file) {
  let record = legacyMap.get(token);
  if (!record) {
    record = { count: 0, files: new Map() };
    legacyMap.set(token, record);
  }
  record.count += 1;
  record.files.set(file, (record.files.get(file) ?? 0) + 1);
}

function hasAobxCounterpart(token) {
  const suffix = token.replace(/^aob-/, '');
  return allTokens.has(`aobx-${suffix}`);
}

async function main() {
  await Promise.all(ROOTS.map((root) => walk(root)));
  const rows = Array.from(legacyMap.entries()).map(([token, info]) => {
    const files = Array.from(info.files.entries()).map(([file, count]) => ({
      file,
      count
    }));
    return {
      token,
      total: info.count,
      fileCount: info.files.size,
      hasAobx: hasAobxCounterpart(token),
      files
    };
  });

  rows.sort((a, b) => b.total - a.total || a.token.localeCompare(b.token));

  if (process.argv.includes('--json')) {
    process.stdout.write(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          rows
        },
        null,
        2
      )
    );
    return;
  }

  if (rows.length === 0) {
    console.log('No legacy `.aob-*` classes detected in src/options.');
    return;
  }

  const missing = rows.filter((row) => !row.hasAobx);
  const existing = rows.filter((row) => row.hasAobx);

  const formatRow = (row) => `- ${row.token} (total: ${row.total}, files: ${row.fileCount})`;

  if (missing.length) {
    console.log('Legacy classes without `.aobx-*` counterparts:');
    missing.slice(0, 50).forEach((row) => console.log(formatRow(row)));
    if (missing.length > 50) {
      console.log(`  ...and ${missing.length - 50} more`);
    }
    console.log('');
  } else {
    console.log('All legacy `.aob-*` classes have `.aobx-*` counterparts.\n');
  }

  if (existing.length) {
    console.log('Legacy classes already paired with `.aobx-*` (safe to keep until cleanup):');
    existing.slice(0, 30).forEach((row) => console.log(formatRow(row)));
    if (existing.length > 30) {
      console.log(`  ...and ${existing.length - 30} more`);
    }
  }
}

main().catch((error) => {
  console.error('[options-css-legacy-report] Failed:', error);
  process.exitCode = 1;
});
