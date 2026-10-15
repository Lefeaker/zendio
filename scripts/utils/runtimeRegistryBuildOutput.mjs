import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

export function auditRuntimeRegistryBuildOutput(chunksDir) {
  if (!existsSync(chunksDir)) return ['Missing build chunks directory; run a build first.'];
  const files = readdirSync(chunksDir).filter((file) => file.endsWith('.js'));
  const findings = [];
  const findChunk = (prefix) => {
    const matches = files.filter((file) => file.startsWith(`${prefix}-`));
    if (matches.length !== 1) {
      findings.push(`Expected exactly one ${prefix} chunk; found ${matches.length}.`);
      return null;
    }
    return matches[0];
  };
  const extractor = findChunk('aiChatExtractor');
  const registry = findChunk('runtimeRegistry');
  const parsers = findChunk('runtimePlatformParsers');
  const read = (file) => readFileSync(join(chunksDir, file), 'utf8');
  const imports = (source) => [...source.matchAll(staticImportPattern)].map((match) => match[1]);
  const seen = new Set();
  const pending = extractor ? [extractor] : [];
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!files.includes(file)) {
      findings.push(`Missing static dependency chunk: ${file}.`);
      continue;
    }
    const source = read(file);
    for (const marker of parserImplementationMarkers) {
      if (source.includes(marker))
        findings.push(`${file}: eager platform parser marker ${marker}.`);
    }
    if (file.startsWith('runtimePlatformParsers-'))
      findings.push(`${file}: eagerly imported parser chunk.`);
    pending.push(...imports(source));
  }
  if (registry && parsers) {
    const source = read(registry);
    const dynamicImports = [
      ...source.matchAll(/import\(["']\.\/(runtimePlatformParsers-[^"']+\.js)["']\)/g)
    ].map((match) => match[1]);
    if (dynamicImports.length !== 1 || dynamicImports[0] !== parsers) {
      findings.push(`${registry}: expected one dynamic import of ${parsers}.`);
    }
    if (imports(source).includes(parsers))
      findings.push(`${registry}: statically imports ${parsers}.`);
  }
  return findings;
}
