/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AI_CHAT_DOCUMENT_PREPARERS,
  prepareAIChatDocumentForExtraction
} from '../../../src/content/extractors/aiChatDocumentPreparer';

describe('AI chat document preparer registry', () => {
  it('keeps live-DOM preparation explicit and platform-scoped', async () => {
    expect(Object.keys(AI_CHAT_DOCUMENT_PREPARERS)).toEqual(['deepseek']);

    await expect(prepareAIChatDocumentForExtraction('chatgpt', document)).resolves.toBe(document);
  });

  it('does not dispatch platform preparation through ad hoc platform checks', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/content/extractors/aiChatDocumentPreparer.ts'),
      'utf8'
    );

    expect(source).toContain('AI_CHAT_DOCUMENT_PREPARERS');
    expect(source).not.toContain("platform === 'deepseek'");
    expect(source).not.toContain('switch (platform)');
  });
});
