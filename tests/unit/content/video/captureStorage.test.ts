import { describe, expect, it, vi } from 'vitest';
import { deserializeStoredCaptures, loadStoredCaptureData } from '@content/video/captureStorage';
import type { CanonicalLegacyVideoCapture } from '@shared/sessionDrafts';

describe('captureStorage', () => {
  it('serializes and deserializes timestamp and fragment captures with fallbacks', () => {
    const now = Date.now();
    const serialized = [
      {
        kind: 'timestamp',
        id: 'ts',
        timeSec: 12,
        comment: 'mark',
        url: 'https://video.example?t=12',
        createdAt: now,
        screenshotRequested: true
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
    ] satisfies CanonicalLegacyVideoCapture[];

    expect(serialized[0]).toMatchObject({
      kind: 'timestamp',
      screenshotRequested: true
    });
    expect(serialized[0]).not.toHaveProperty('screenshot');
    expect(serialized[1]).toMatchObject({ kind: 'fragment', wrapperId: 'wrap-1' });

    const restored = deserializeStoredCaptures(
      [
        serialized[0],
        {
          kind: 'timestamp',
          id: 'legacy-ts',
          timeSec: 15,
          comment: 'legacy',
          url: 'https://legacy.example/watch?t=15',
          createdAt: now + 1,
          screenshotRequested: true
        },
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
      screenshotRequested: true
    });
    const firstTimestamp = restored[0];
    if (firstTimestamp?.kind !== 'timestamp') throw new Error('expected first timestamp capture');
    expect(firstTimestamp.screenshot).toBeUndefined();
    expect(restored[1]).toMatchObject({
      kind: 'timestamp',
      url: 'https://legacy.example/watch?t=15',
      screenshotRequested: true
    });
    const secondTimestamp = restored[1];
    if (secondTimestamp?.kind !== 'timestamp') throw new Error('expected second timestamp capture');
    expect(secondTimestamp.screenshot).toBeUndefined();
    expect(restored[2]).toMatchObject({ kind: 'fragment', selectedHtml: '', fragmentUrl: '' });
  });

  it('loads a bounded canonical value with migration digests and exposes no write seam', async () => {
    const storage = {
      get: vi.fn().mockResolvedValue({
        title: 'Saved',
        url: 'https://example.com',
        entries: [],
        updatedAt: 1
      })
    };

    const loaded = await loadStoredCaptureData(storage, 'video:key');
    if (!loaded) throw new Error('expected stored capture data');

    expect(loaded.title).toBe('Saved');
    expect(loaded.migration.legacyKey).toBe('video:key');
    expect(loaded.migration.rawDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(loaded.migration.canonicalDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(storage.get).toHaveBeenCalledWith('video:key');
  });
});
