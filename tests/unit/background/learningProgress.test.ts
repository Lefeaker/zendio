import { createMemoryStorageArea } from '../../../src/platform/preview/memoryStorage';
import type { LearningExport } from '../../../src/background/services/learningProgress';
import { describe, expect, it, vi } from 'vitest';
import {
  createLearningProgressStore,
  learningCoursesForExport
} from '../../../src/background/services/learningProgress';
import {
  LEARNING_PROGRESS_KEY,
  readLearningProgress,
  type LearningReceipt
} from '../../../src/shared/learningProgress';
import type { DownloadStatus, DownloadsService } from '../../../src/platform/interfaces/downloads';

function rig() {
  const files = new Map<number | string, DownloadStatus>();
  const storage = createMemoryStorageArea();
  const getMock = vi.spyOn(storage, 'get');
  vi.spyOn(storage, 'set');
  const downloads: DownloadsService = {
    download: vi.fn(),
    inspect: vi.fn((id: number | string) => Promise.resolve(files.get(id))),
    onChanged: vi.fn(() => () => {})
  };
  const store = createLearningProgressStore(storage, downloads);
  return {
    files,
    storage,
    downloads,
    store,
    getMock,
    read: async () => readLearningProgress(await storage.get(LEARNING_PROGRESS_KEY))
  };
}

const receipt: LearningReceipt = {
  operationId: 'op_learning1',
  filePath: 'notes/first.md',
  destination: 'downloads',
  downloadId: 2,
  savedAt: 10
};

describe('learning export progress', () => {
  it('waits for every attachment and uses the final download filename', async () => {
    const r = rig();
    r.files.set(1, { state: 'in_progress', filename: '/downloads/image.png' });
    r.files.set(2, { state: 'complete', filename: '/downloads/first (1).md' });
    await r.store.record({ receipt, courses: ['video'], downloadIds: [1, 2] });
    expect((await r.read()).completed).toEqual({});
    expect((await r.read()).pending).toHaveLength(1);
    r.files.set(1, { state: 'complete', filename: '/downloads/image.png' });
    await r.store.reconcile();
    expect((await r.read()).completed.video?.filePath).toBe('/downloads/first (1).md');
    expect((await r.read()).pending).toEqual([]);
  });

  it('does not complete interrupted or unobservable downloads', async () => {
    const r = rig();
    r.files.set(2, { state: 'interrupted', filename: 'first.md' });
    await r.store.record({ receipt, courses: ['fragment'], downloadIds: [2] });
    expect((await r.read()).completed).toEqual({});
    expect((await r.read()).pending[0]?.failed).toBe(true);
    await r.store.record({
      receipt: { ...receipt, operationId: 'op_next' },
      courses: ['article'],
      downloadIds: []
    });
    expect((await r.read()).completed).toEqual({});
    expect((await r.read()).pending[0]?.failed).toBe(true);
  });

  it('recovers pending downloads with a new background instance', async () => {
    const r = rig();
    r.files.set(2, { state: 'in_progress', filename: '/downloads/first.md' });
    await r.store.record({ receipt, courses: ['fragment'], downloadIds: [2] });
    r.files.set(2, { state: 'complete', filename: '/downloads/first.md' });
    const resumed = createLearningProgressStore(r.storage, r.downloads);
    await resumed.reconcile();
    expect((await r.read()).completed.fragment).toBeDefined();
  });

  it('serializes simultaneous exports without losing completed lessons or regressing results', async () => {
    const r = rig();
    await Promise.all([
      r.store.record({
        receipt: { ...receipt, destination: 'vault', savedAt: 20 },
        courses: ['fragment'],
        downloadIds: []
      }),
      r.store.record({
        receipt: { ...receipt, operationId: 'op_older', destination: 'vault', savedAt: 5 },
        courses: ['article'],
        downloadIds: []
      })
    ]);
    expect(Object.keys((await r.read()).completed).sort()).toEqual([
      'article',
      'fragment',
      'vault'
    ]);
    expect((await r.read()).latest?.savedAt).toBe(20);
  });

  it('does not replace stored progress when a read fails and accepts a later retry', async () => {
    const r = rig();
    const input: LearningExport = {
      receipt: { ...receipt, destination: 'vault' },
      courses: ['article'],
      downloadIds: []
    };
    r.getMock.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(r.store.record(input)).rejects.toThrow('storage unavailable');
    expect(r.storage.set).not.toHaveBeenCalled();
    await r.store.record(input);
    expect((await r.read()).completed.article).toBeDefined();
  });

  it('never marks a previous completed lesson undone after a later failed download', async () => {
    const r = rig();
    await r.store.record({
      receipt: { ...receipt, destination: 'vault' },
      courses: ['fragment'],
      downloadIds: []
    });
    r.files.set(3, { state: 'interrupted', filename: 'next.md' });
    await r.store.record({
      receipt: { ...receipt, operationId: 'op_next', savedAt: 30 },
      courses: ['fragment'],
      downloadIds: [3]
    });
    expect((await r.read()).completed.fragment?.destination).toBe('vault');
    expect((await r.read()).pending[0]?.failed).toBe(true);
  });
});

describe('lesson evidence', () => {
  it('requires two reader highlights and a timestamp plus screenshot for video', () => {
    expect(
      learningCoursesForExport(
        { markdown: 'a', type: 'clipper', meta: { readerMode: true, highlightCount: 1 } },
        0
      )
    ).toEqual([]);
    expect(
      learningCoursesForExport(
        { markdown: 'a', type: 'clipper', meta: { readerMode: true, highlightCount: 2 } },
        0
      )
    ).toEqual(['reader']);
    expect(
      learningCoursesForExport({ markdown: 'a', type: 'video', meta: { timestampCount: 1 } }, 0)
    ).toEqual([]);
    expect(
      learningCoursesForExport({ markdown: 'a', type: 'video', meta: { timestampCount: 1 } }, 1)
    ).toEqual(['video']);
  });
});
