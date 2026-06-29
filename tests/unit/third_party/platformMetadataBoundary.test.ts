import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const aiChatRoot = resolve(process.cwd(), 'src/third_party/ai-chat-exporter');

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function expectNoRuntimeParserImports(filePath: string): void {
  const code = source(filePath);

  expect(code).not.toMatch(/from ['"].*\/platforms\//u);
  expect(code).not.toMatch(/from ['"].*runtimePlatformParsers/u);
  expect(code).not.toMatch(/from ['"].*\/registry/u);
  expect(code).not.toMatch(/from ['"].*\/parse/u);
}

describe('AI chat platform metadata boundaries', () => {
  it('keeps platform identity and product surface in separate lightweight owner modules', () => {
    expect(existsSync(resolve(aiChatRoot, 'platformIdentity.ts'))).toBe(true);
    expect(existsSync(resolve(aiChatRoot, 'platformProductSurface.ts'))).toBe(true);
  });

  it('keeps identity and product-surface metadata free of parser runtime imports', () => {
    expectNoRuntimeParserImports('src/third_party/ai-chat-exporter/platformIdentity.ts');
    expectNoRuntimeParserImports('src/third_party/ai-chat-exporter/platformProductSurface.ts');
  });

  it('keeps Options on the product-surface boundary instead of the aggregate platform registry', () => {
    const optionsSources = [
      'src/options/stitch/content.ts',
      'src/options/stitch/schema/builders/settings.ts'
    ].map(source);

    for (const code of optionsSources) {
      expect(code).toContain('ai-chat-exporter/platformProductSurface');
      expect(code).not.toContain('ai-chat-exporter/platformRegistry');
      expect(code).not.toContain('ai-chat-exporter/runtimeRegistry');
      expect(code).not.toContain('ai-chat-exporter/runtimePlatformParsers');
    }
  });
});
