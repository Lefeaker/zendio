/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { serializeVideoScreenshotAttachment } from '@content/video/videoScreenshotAttachmentSerialization';
import type { VideoCaptureScreenshot } from '@content/video/types';

function createBlobScreenshot(
  overrides: Partial<VideoCaptureScreenshot> = {}
): VideoCaptureScreenshot {
  const blob = new Blob(['frame'], { type: 'image/jpeg' });
  return {
    id: 'shot-blob',
    fileName: 'shot-blob.jpg',
    mimeType: 'image/jpeg',
    capturedAt: 2_000_000_000_000,
    content: {
      kind: 'blob',
      blob,
      byteLength: blob.size
    },
    ...overrides
  };
}

function createThrowingBlob(): Blob {
  return {
    size: 5,
    type: 'image/jpeg',
    arrayBuffer: () =>
      Promise.reject(new Error('Permission denied to access property "constructor"'))
  } as Blob;
}

describe('serializeVideoScreenshotAttachment', () => {
  it('serializes readable blob screenshots as binary attachments', async () => {
    const attachment = await serializeVideoScreenshotAttachment(createBlobScreenshot());

    expect(attachment).toEqual({
      id: 'shot-blob',
      fileName: 'shot-blob.jpg',
      mimeType: 'image/jpeg',
      content: {
        encoding: 'base64',
        data: 'ZnJhbWU=',
        byteLength: 5
      }
    });
  });

  it('falls back to dataUrl when Firefox blocks blob serialization', async () => {
    const attachment = await serializeVideoScreenshotAttachment(
      createBlobScreenshot({
        id: 'shot-firefox',
        fileName: 'shot-firefox.jpg',
        dataUrl: 'data:image/jpeg;base64,ZmlyZWZveA==',
        content: {
          kind: 'blob',
          blob: createThrowingBlob(),
          byteLength: 7
        }
      })
    );

    expect(attachment).toEqual({
      id: 'shot-firefox',
      fileName: 'shot-firefox.jpg',
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,ZmlyZWZveA=='
    });
  });

  it('serializes dataUrl-only screenshots without requiring blob content', async () => {
    const attachment = await serializeVideoScreenshotAttachment({
      id: 'shot-data-url',
      fileName: 'shot-data-url.jpg',
      mimeType: 'image/jpeg',
      capturedAt: 2_000_000_000_001,
      dataUrl: 'data:image/jpeg;base64,ZGF0YQ=='
    });

    expect(attachment).toEqual({
      id: 'shot-data-url',
      fileName: 'shot-data-url.jpg',
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,ZGF0YQ=='
    });
  });

  it('rejects invalid dataUrl screenshots', async () => {
    await expect(
      serializeVideoScreenshotAttachment({
        id: 'shot-invalid',
        fileName: 'shot-invalid.jpg',
        mimeType: 'image/jpeg',
        capturedAt: 2_000_000_000_002,
        dataUrl: 'data:image/png;base64,bm90LWpwZWc='
      })
    ).resolves.toBeNull();
  });
});
