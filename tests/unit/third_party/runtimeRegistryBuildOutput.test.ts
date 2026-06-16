import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const chunksDir = resolve(process.cwd(), 'build/dist/chunks');
const itWithBuild = existsSync(chunksDir) ? it : it.skip;

const staticImportPattern = /import\s*(?:[\w*{][^'"]*from\s*)?["']\.\/([^"']+)["']/g;

const parserImplementationMarkers = [
  'chatgptParser',
  'claudeParser',
  'geminiParser',
  'kimiParser',
  'perplexityParser',
  'runtimePlatformParsers',
  'id:"chatgpt",parse',
  'id:"claude",parse',
  'id:"gemini",parse',
  'id:"kimi",aliases:["moonshot"]',
  'id:"perplexity",aliases:["pplx"]'
];

function listChunks(): string[] {
  return readdirSync(chunksDir)
    .filter((file) => file.endsWith('.js'))
    .sort();
}

function readChunk(file: string): string {
  return readFileSync(join(chunksDir, file), 'utf8');
}

function findChunk(files: string[], pattern: RegExp): string {
  const matches = files.filter((file) => pattern.test(file));
  expect(matches).toHaveLength(1);
  const match = matches[0];
  if (!match) {
    throw new Error(`Expected exactly one chunk matching ${pattern}`);
  }
  return match;
}

function collectStaticImportGraph(entryFile: string): string[] {
  const seen = new Set<string>();
  const pending = [entryFile];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || seen.has(current)) {
      continue;
    }

    seen.add(current);
    const source = readChunk(current);
    for (const match of source.matchAll(staticImportPattern)) {
      const imported = match[1];
      if (imported && existsSync(join(chunksDir, imported)) && !seen.has(imported)) {
        pending.push(imported);
      }
    }
  }

  return Array.from(seen).sort();
}

describe('runtime AI chat parser registry build output', () => {
  itWithBuild('keeps aiChatExtractor static chunks free of platform parser implementations', () => {
    const files = listChunks();
    const aiChatExtractorFile = findChunk(files, /^aiChatExtractor-.*\.js$/);
    const staticGraph = collectStaticImportGraph(aiChatExtractorFile);
    const staticGraphNames = staticGraph.map((file) => basename(file));
    const staticGraphSource = staticGraph.map(readChunk).join('\n');

    expect(staticGraphNames).not.toContainEqual(expect.stringMatching(/^runtimePlatformParsers-/));
    for (const marker of parserImplementationMarkers) {
      expect(staticGraphSource).not.toContain(marker);
    }
  });

  itWithBuild(
    'keeps runtimeRegistry pointed at one dynamic runtimePlatformParsers boundary',
    () => {
      const files = listChunks();
      const runtimeRegistryFile = findChunk(files, /^runtimeRegistry-.*\.js$/);
      const runtimePlatformParserFiles = files.filter((file) =>
        /^runtimePlatformParsers-.*\.js$/.test(file)
      );
      const runtimeRegistrySource = readChunk(runtimeRegistryFile);

      expect(runtimePlatformParserFiles).toHaveLength(1);
      expect(runtimeRegistrySource).toMatch(/import\("\.\/runtimePlatformParsers-[^"']+\.js"\)/);
      expect(
        [...runtimeRegistrySource.matchAll(staticImportPattern)].map((match) => match[1])
      ).not.toContain(runtimePlatformParserFiles[0]);
    }
  );
});
