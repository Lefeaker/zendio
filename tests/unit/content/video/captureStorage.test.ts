import { describe, expect, it, vi } from 'vitest';
import {
  deserializeStoredCaptures,
  loadStoredCaptureData,
  saveCaptureData,
  serializeCaptures
} from '@content/video/captureStorage';

describe('captureStorage', () => {
  it('serializes and deserializes timestamp and fragment captures with fallbacks', () => {
    const now = Date.now();
    const serialized = serializeCaptures([
      {
        kind: 'timestamp',
        id: 'ts',
        timeSec: 12,
        comment: 'mark',
        url: 'https://video.example?t=12',
        createdAt: now,
        screenshot: {
          id: 'shot-1',
          fileName: 'video-0m12s-screenshot.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,shot',
          capturedAt: now
        }
      },
      {
        kind: 'fragment',
        id: 'fg',
        comment: 'note',
        selectedText: 'Quote',
        selectedHtml: '<p>Quote</p>',
        fragmentUrl: 'https://video.example#:~:text=Quote',
        createdAt: now + 1,
        wrapperId: 'wrap-1'
      }
    ]);

    expect(serialized[0]).toMatchObject({
      kind: 'timestamp',
      screenshot: {
        fileName: 'video-0m12s-screenshot.png',
        dataUrl: 'data:image/png;base64,shot'
      }
    });
    expect(serialized[1]).toMatchObject({ kind: 'fragment', wrapperId: 'wrap-1' });

    const restored = deserializeStoredCaptures(
      [
        serialized[0],
        {
          kind: 'fragment',
          id: 'fg-2',
          comment: '',
          selectedText: 'Fallback',
          selectedHtml: '',
          fragmentUrl: '',
          createdAt: now + 2
        }
      ],
      { fallbackUrl: 'https://fallback.example/video' }
    );

    expect(restored[0]).toMatchObject({
      kind: 'timestamp',
      url: 'https://video.example?t=12',
      screenshot: {
        fileName: 'video-0m12s-screenshot.png',
        dataUrl: 'data:image/png;base64,shot'
      }
    });
    expect(restored[1]).toMatchObject({ kind: 'fragment', selectedHtml: '', fragmentUrl: '' });
  });

  it('delegates load and save to the provided storage namespace', async () => {
    const storage = {
      get: vi
        .fn()
        .mockResolvedValue({
          title: 'Saved',
          url: 'https://example.com',
          entries: [],
          updatedAt: 1
        }),
      set: vi.fn().mockResolvedValue(undefined)
    };

    await expect(loadStoredCaptureData(storage, 'video:key')).resolves.toMatchObject({
      title: 'Saved'
    });
    await saveCaptureData(storage, 'video:key', {
      title: 'Next',
      url: '',
      entries: [],
      updatedAt: 2
    });
    expect(storage.get).toHaveBeenCalledWith('video:key');
    expect(storage.set).toHaveBeenCalledWith('video:key', {
      title: 'Next',
      url: '',
      entries: [],
      updatedAt: 2
    });
  });
});
