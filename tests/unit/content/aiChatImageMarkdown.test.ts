// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  createAIChatImageResolver,
  finalizeAIChatImageMarkdown
} from '../../../src/content/extractors/aiChatImageMarkdown';
import type { PreparedAIChatDocument } from '../../../src/content/extractors/aiChatImagePreparation';
import {
  countClipAttachmentReferences,
  replaceClipAttachmentReferences
} from '../../../src/shared/attachments/clipAttachmentReferences';

function prepared(
  [firstAlt, secondAlt]: readonly [string, string] = ['first [image]', 'second']
): PreparedAIChatDocument {
  return {
    document,
    attachments: [],
    occurrences: new Map([
      ['one', { attachmentId: 'same-bytes', alt: firstAlt }],
      ['two', { attachmentId: 'same-bytes', alt: secondAlt }]
    ])
  };
}

function resolveImages(bundle: PreparedAIChatDocument): string {
  const resolve = createAIChatImageResolver(bundle);
  return [...bundle.occurrences.keys()]
    .map((token) => {
      const image = document.createElement('img');
      image.setAttribute('data-aiob-image-token', token);
      return resolve(image);
    })
    .join(' ');
}

describe('AI chat image occurrence accounting', () => {
  it.each<{ name: string; alts: readonly [string, string] }>([
    { name: 'single backticks', alts: ['first `', 'second `'] },
    { name: 'multiple backticks', alts: ['first ``', 'second ``'] },
    { name: 'backslash before backticks', alts: ['first \\`', 'second \\`'] },
    { name: 'HTML comment delimiters', alts: ['<!-- open', 'close -->'] },
    { name: 'HTML attribute delimiters', alts: ['<span title="open', 'close">'] },
    {
      name: 'brackets, backslashes and nested Markdown image text',
      alts: ['[first] \\ [image]', '![literal](aiob-attachment:unknown)']
    },
    { name: 'entity-like text', alts: ['&grave; &#96;', '&lt;tag&gt; &amp;'] }
  ])('keeps both real references when alt contains $name', ({ alts }) => {
    const bundle = prepared(alts);
    const markdown = resolveImages(bundle);
    expect(countClipAttachmentReferences(markdown, ['one', 'two'])).toEqual(
      new Map([
        ['one', 1],
        ['two', 1]
      ])
    );
    const finalized = finalizeAIChatImageMarkdown(markdown, bundle);
    expect(countClipAttachmentReferences(finalized, ['same-bytes'])).toEqual(
      new Map([['same-bytes', 2]])
    );
    const saved = replaceClipAttachmentReferences(finalized, [
      { id: 'same-bytes', markdownUrl: 'assets/image.png' }
    ]);
    expect(saved.match(/\]\(assets\/image\.png\)/gu)).toHaveLength(2);
    expect(saved).not.toContain('(aiob-attachment:one)');
    expect(saved).not.toContain('(aiob-attachment:two)');
  });

  it('serializes formatting, HTML and entity punctuation as literal alt text', () => {
    const bundle = prepared([
      'line\r\n\\ [image] <tag> &copy; *bold* _em_ ~~strike~~ |cell|',
      '&grave; &#96;'
    ]);
    expect(resolveImages(bundle)).toBe(
      '![line \\\\ \\[image\\] \\<tag\\> \\&copy\\; \\*bold\\* \\_em\\_ \\~\\~strike\\~\\~ \\|cell\\|](aiob-attachment:one) ' +
        '![\\&grave\\; \\&\\#96\\;](aiob-attachment:two)'
    );
  });

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
  it.each([
    '`![literal](aiob-attachment:one)`',
    '```md\n![literal](aiob-attachment:one)\n```',
    '~~~md\n![literal](aiob-attachment:one)\n~~~'
  ])('does not count or rewrite actual code: %s', (literal) => {
    expect(countClipAttachmentReferences(literal, ['one', 'two'])).toEqual(new Map());
    expect(() => finalizeAIChatImageMarkdown(literal, prepared())).toThrow(
      'AI_CHAT_IMAGE_OCCURRENCE_MISSING'
    );
    const bundle = prepared(['first `', 'second `']);
    const markdown = `${literal}\n\n${resolveImages(bundle)}`;
    const finalized = finalizeAIChatImageMarkdown(markdown, bundle);
    expect(finalized).toContain(literal);
    expect(countClipAttachmentReferences(finalized, ['same-bytes'])).toEqual(
      new Map([['same-bytes', 2]])
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
