import { describe, it, expect } from 'vitest';
import { ClipPayloadSchema } from '@shared/schemas';

describe('ClipPayloadSchema', () => {
  const legacyAttachment = {
    id: 'shot-1',
    fileName: 'frame.jpg',
    mimeType: 'image/jpeg',
    dataUrl: 'data:image/jpeg;base64,aaa'
  };

  it('preserves bounded export operation identity and rejects arbitrary operation text', () => {
    const parsed = ClipPayloadSchema.parse({
      markdown: '# note',
      meta: { operationId: 'op_saved12345' }
    });
    expect(parsed.meta?.operationId).toBe('op_saved12345');
    expect(
      ClipPayloadSchema.safeParse({
        markdown: '# note',
        meta: { operationId: 'private path or content' }
      }).success
    ).toBe(false);
  });

  it('accepts minimal valid payload', () => {
    const res = ClipPayloadSchema.safeParse({ markdown: '# title' });
    expect(res.success).toBe(true);
  });

  it.each([
    '```markdown\n![Screenshot](aiob-attachment:example)\n```',
    'Use `![Screenshot](aiob-attachment:example)` in the producer.',
    '    ![Screenshot](aiob-attachment:example)',
    '!\\[Screenshot](aiob-attachment:example)'
  ])('accepts literal code and escaped examples without attachment bytes: %s', (markdown) => {
    const parsed = ClipPayloadSchema.parse({ markdown, type: 'ai_chat' });
    expect(parsed.markdown).toBe(markdown);
    expect(
      ClipPayloadSchema.safeParse({
        markdown: `${markdown}\n\n![Missing](aiob-attachment:missing)`
      }).success
    ).toBe(false);
  });

  it('reserves inline attachment destinations while preserving ordinary marker text and unreferenced attachments', () => {
    const markdown = 'The token aiob-attachment:missing and `aiob-attachment:missing` are prose.';
    expect(ClipPayloadSchema.safeParse({ markdown }).success).toBe(true);
    expect(
      ClipPayloadSchema.safeParse({ markdown, meta: { attachments: [legacyAttachment] } }).success
    ).toBe(true);
    for (const attachments of [undefined, [], [legacyAttachment]]) {
      expect(
        ClipPayloadSchema.safeParse({
          markdown: '![Missing](aiob-attachment:missing)',
          meta: { attachments }
        }).success
      ).toBe(false);
    }
  });

  it('keeps the existing arbitrary ID contract and resolves IDs exactly', () => {
    const ids = ['a', 'ab', 'a)b', 'a.*$[x] 中文'];
    const payload = {
      markdown: ids.map((id) => `![Image](aiob-attachment:${id})`).join('\n'),
      meta: {
        attachments: ids.map((id) => ({ ...legacyAttachment, id }))
      }
    };
    expect(ClipPayloadSchema.safeParse(payload).success).toBe(true);
    expect(
      ClipPayloadSchema.safeParse({
        ...payload,
        meta: { attachments: [{ ...legacyAttachment, id: 'a' }] }
      }).success
    ).toBe(false);
  });

  it('accepts full payload with bounded production meta and strips extras', () => {
    const res = ClipPayloadSchema.safeParse({
      markdown: 'content',
      title: 't',
      type: 'article',
      meta: {
        url: 'https://example.com',
        domain: 'example.com',
        platform: 'web',
        sourceUrl: 'https://source.example.com',
        resolvedUrl: 'https://example.com/resolved',
        clippedAtISO: '2026-05-29T00:00:00.000Z',
        fragmentUrl: 'https://example.com/#:~:text=hello',
        hasComment: true,
        selectedTextPreview: 'Selected text',
        model: 'gpt-4o',
        messageCount: 2,
        createdAt: '2026-05-28T00:00:00.000Z',
        readerMode: true,
        exportMode: 'full',
        highlightCount: 1,
        commentCount: 1,
        fragmentUrls: ['https://example.com/#frag'],
        captureCount: 3,
        timestampCount: 2,
        fragmentCount: 1,
        storageKey: 'video:1',
        attachments: [
          {
            ...legacyAttachment,
            ignored: true
          }
        ],
        exportDestination: { kind: 'vault', vaultId: 'local-vault', ignored: true },
        extra: 1
      },
      extraTop: true
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.meta?.platform).toBe('web');
      expect('extraTop' in res.data).toBe(false);
      expect('extra' in (res.data.meta ?? {})).toBe(false);
      expect(res.data.meta?.attachments?.[0]).toEqual(legacyAttachment);
      expect(res.data.meta?.exportDestination).toEqual({
        kind: 'vault',
        vaultId: 'local-vault'
      });
    }
  });

  it('rejects empty markdown', () => {
    const res = ClipPayloadSchema.safeParse({ markdown: '' });
    expect(res.success).toBe(false);
  });

  it('accepts binary attachment payloads and strips nested extras', () => {
    const res = ClipPayloadSchema.safeParse({
      markdown: 'content',
      type: 'video',
      meta: {
        attachments: [
          {
            id: 'shot-2',
            fileName: 'frame.jpg',
            mimeType: 'image/jpeg',
            content: {
              encoding: 'base64',
              data: 'Zm9v',
              byteLength: 3,
              ignored: true
            },
            ignored: true
          }
        ]
      }
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.meta?.attachments?.[0]).toEqual({
        id: 'shot-2',
        fileName: 'frame.jpg',
        mimeType: 'image/jpeg',
        content: {
          encoding: 'base64',
          data: 'Zm9v',
          byteLength: 3
        }
      });
    }
  });

  it('rejects malformed bounded meta fields', () => {
    expect(
      ClipPayloadSchema.safeParse({
        markdown: 'content',
        meta: {
          attachments: [{ id: 'shot-1', fileName: 'frame.jpg', mimeType: 'image/jpeg' }],
          exportDestination: { kind: 'external' }
        }
      }).success
    ).toBe(false);

    expect(
      ClipPayloadSchema.safeParse({
        markdown: 'content',
        meta: {
          attachments: [
            {
              id: 'shot-1',
              fileName: 'frame.jpg',
              mimeType: 'image/png',
              dataUrl: 'data:image/jpeg;base64,aaa'
            }
          ]
        }
      }).success
    ).toBe(false);

    expect(
      ClipPayloadSchema.safeParse({
        markdown: 'content',
        meta: {
          attachments: [
            {
              id: 'shot-1',
              fileName: 'frame.jpg',
              mimeType: 'image/jpeg',
              content: {
                encoding: 'base64',
                data: 'Zm9v',
                byteLength: -1
              }
            }
          ]
        }
      }).success
    ).toBe(false);
  });
});
