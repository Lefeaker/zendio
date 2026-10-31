// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  createAIChatImageResolver,
  finalizeAIChatImageMarkdown
} from '../../../src/content/extractors/aiChatImageMarkdown';
import type { PreparedAIChatDocument } from '../../../src/content/extractors/aiChatImagePreparation';

function prepared(): PreparedAIChatDocument {
  return {
    document,
    attachments: [],
    occurrences: new Map([
      ['one', { attachmentId: 'same-bytes', alt: 'first [image]' }],
      ['two', { attachmentId: 'same-bytes', alt: 'second' }]
    ])
  };
}

describe('AI chat image occurrence accounting', () => {
  it('keeps two positions while deduplicating their file identity', () => {
    expect(
      finalizeAIChatImageMarkdown(
        '![a](aiob-attachment:one)\n\n![b](aiob-attachment:two)',
        prepared()
      )
    ).toBe('![a](aiob-attachment:same-bytes)\n\n![b](aiob-attachment:same-bytes)');
  });
  it.each([
    '![a](aiob-attachment:one)',
    '![a](aiob-attachment:one) ![b](aiob-attachment:one) ![c](aiob-attachment:two)',
    '![a](aiob-attachment:one) ![b](aiob-attachment:two) ![c](aiob-attachment:unknown)',
    '`![a](aiob-attachment:one)` ![b](aiob-attachment:two)'
  ])('rejects missing, duplicate or unprepared occurrences: %s', (markdown) => {
    expect(() => finalizeAIChatImageMarkdown(markdown, prepared())).toThrow(
      'AI_CHAT_IMAGE_OCCURRENCE_MISSING'
    );
  });
  it('does not rewrite a code example that resembles a generated reference', () => {
    const markdown =
      '```md\n![literal](aiob-attachment:one)\n```\n\n![a](aiob-attachment:one) ![b](aiob-attachment:two)';
    expect(finalizeAIChatImageMarkdown(markdown, prepared())).toContain(
      '```md\n![literal](aiob-attachment:one)\n```'
    );
  });
  it('escapes alt text and fails on unregistered image nodes', () => {
    const image = document.createElement('img');
    const resolve = createAIChatImageResolver(prepared());
    expect(() => resolve(image)).toThrow('AI_CHAT_IMAGE_NOT_PREPARED');
    image.setAttribute('data-aiob-image-token', 'one');
    expect(resolve(image)).toBe('![first \\[image\\]](aiob-attachment:one)');
    expect(createAIChatImageResolver(prepared())(image)).toBe(resolve(image));
  });
});
