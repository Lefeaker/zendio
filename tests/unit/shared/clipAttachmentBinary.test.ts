import { describe, expect, it, vi } from 'vitest';
import { serializeVideoScreenshotAttachment } from '@content/video/videoScreenshotAttachmentSerialization';
import {
  isValidSerializedClipAttachmentBinaryContent,
  isValidLegacyAttachmentDataUrl,
  serializedAttachmentContentToBlob
} from '@shared/attachments/clipAttachmentBinary';
import { ClipPayloadSchema } from '@shared/schemas/clip.schema';
import { prepareVideoClipAttachments } from '../../../src/background/application/videoScreenshotAttachmentPlanner';

describe('attachment byte integrity', () => {
  it.each(['YQ==', 'YQ', ' Y\tQ==\r\n', 'YWJj', 'YWI=', 'YWI'])(
    'accepts atob-compatible base64 %j',
    (data) => {
      const byteLength = atob(data).length;
      expect(
        isValidSerializedClipAttachmentBinaryContent({ encoding: 'base64', data, byteLength })
      ).toBe(true);
      expect(isValidLegacyAttachmentDataUrl(`data:image/jpeg;base64,${data}`, 'image/jpeg')).toBe(
        true
      );
      expect(
        isValidSerializedClipAttachmentBinaryContent({
          encoding: 'base64',
          data,
          byteLength: byteLength + 1
        })
      ).toBe(false);
    }
  );

  it.each(['!', 'Y', 'Y===', 'YQ=', 'YQ===', 'Y=Q=', 'YQ==extra', 'YQ==\u00a0'])(
    'rejects invalid base64 %j',
    (data) => {
      expect(() => atob(data)).toThrow();
      expect(
        isValidSerializedClipAttachmentBinaryContent({ encoding: 'base64', data, byteLength: 1 })
      ).toBe(false);
      expect(isValidLegacyAttachmentDataUrl(`data:image/jpeg;base64,${data}`, 'image/jpeg')).toBe(
        false
      );
    }
  );

  it('accepts real Blob and legacy screenshot producers without constructing Blobs in preflight', async () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const binary = await serializeVideoScreenshotAttachment({
      id: 'a',
      fileName: 'frame.jpg',
      mimeType: 'image/jpeg',
      capturedAt: 1,
      content: { kind: 'blob', blob, byteLength: blob.size }
    });
    const legacy = await serializeVideoScreenshotAttachment({
      id: 'ab',
      fileName: 'legacy.jpg',
      mimeType: 'image/jpeg',
      capturedAt: 2,
      dataUrl: 'data:image/jpeg;base64,AAEfgP8='
    });
    if (!binary || !legacy) throw new Error('Screenshot producers returned no attachment');
    const payload = {
      markdown: '![A](aiob-attachment:a)\n![AB](aiob-attachment:ab)',
      type: 'video',
      meta: { attachments: [binary, legacy] }
    };
    const blobConstructor = vi.spyOn(globalThis, 'Blob');
    const parsed = ClipPayloadSchema.parse(payload);
    const prepared = prepareVideoClipAttachments({
      payload: parsed,
      notePath: 'note.md',
      destination: 'vault'
    });
    expect(blobConstructor).not.toHaveBeenCalled();
    blobConstructor.mockRestore();
    const first = prepared.attachments[0];
    if (!first) throw new Error('Missing first planned attachment');
    expect(
      new Uint8Array(
        await serializedAttachmentContentToBlob(first.content, first.mimeType).arrayBuffer()
      )
    ).toEqual(bytes);
    expect(prepared.markdown).toBe('![A](assets/note/frame.jpg)\n![AB](assets/note/legacy.jpg)');
  });
});
