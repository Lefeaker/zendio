import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeClipRepository } from '../../../src/infrastructure/repositories/ChromeClipRepository';
import { DEFAULT_OPTIONS } from '@shared/config';
import type { IMessagingRepository, Message, MessageHandler } from '@shared/repositories';
import type { ClipData, ClipResult, FragmentConfig } from '@shared/repositories/IClipRepository';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { CompleteOptions } from '@shared/types/options';

function createOptionsSnapshot(): CompleteOptions {
  return {
    ...DEFAULT_OPTIONS,
    rest: {
      ...DEFAULT_OPTIONS.rest,
      baseUrl: 'https://obsidian.example/',
      httpsUrl: 'https://obsidian.example/',
      httpUrl: 'http://obsidian.example/',
      vault: 'Zendio',
      apiKey: 'test-key'
    },
    templates: {
      ...DEFAULT_OPTIONS.templates,
      article: 'article template',
      fragment: 'fragment template',
      reading: 'reading template',
      ai: 'ai template'
    },
    fragmentClipper: {
      ...DEFAULT_OPTIONS.fragmentClipper,
      useFootnoteFormat: true,
      captureContext: true,
      contextLength: 200,
      contextMode: 'chars',
      selectionModifierEnabled: false,
      selectionModifierKeys: []
    }
  };
}

class FakeOptionsRepository implements IOptionsRepository {
  readonly setCalls: Partial<CompleteOptions>[] = [];
  onChangeCalls = 0;
  private readonly listeners = new Set<(options: CompleteOptions) => void>();

  constructor(private options: CompleteOptions) {}

  get(): Promise<CompleteOptions> {
    return Promise.resolve(this.options);
  }

  set(options: Partial<CompleteOptions>): Promise<void> {
    this.setCalls.push(options);
    this.options = {
      ...this.options,
      ...options
    };
    this.emit(this.options);
    return Promise.resolve();
  }

  onChange(callback: (options: CompleteOptions) => void): () => void {
    this.onChangeCalls += 1;
    this.listeners.add(callback);
    callback(this.options);
    return () => {
      this.listeners.delete(callback);
    };
  }

  emit(options: CompleteOptions): void {
    this.options = options;
    for (const listener of this.listeners) {
      listener(options);
    }
  }
}

class FakeMessagingRepository implements IMessagingRepository {
  lastMessage: Message | null = null;
  response: ClipResult = { success: true };
  failure: string | Error | null = null;

  send<T>(message: Message): Promise<T> {
    this.lastMessage = message;
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    return Promise.resolve(this.response as T);
  }

  onMessage(_handler: MessageHandler): () => void {
    return () => undefined;
  }
}

describe('ChromeClipRepository', () => {
  let repo: ChromeClipRepository;
  let optionsSnapshot: CompleteOptions;
  let fakeOptionsRepo: FakeOptionsRepository;
  let fakeMessagingRepo: FakeMessagingRepository;

  beforeEach(() => {
    optionsSnapshot = createOptionsSnapshot();
    fakeOptionsRepo = new FakeOptionsRepository(optionsSnapshot);
    fakeMessagingRepo = new FakeMessagingRepository();
    repo = new ChromeClipRepository(fakeOptionsRepo, fakeMessagingRepo);
  });

  describe('getFragmentConfig()', () => {
    it('returns cloned fragment config from options', async () => {
      const result = await repo.getFragmentConfig();
      expect(result).toEqual(optionsSnapshot.fragmentClipper);
      expect(result).not.toBe(optionsSnapshot.fragmentClipper);

      result.contextLength = 999;
      const fresh = await repo.getFragmentConfig();
      expect(fresh.contextLength).toBe(optionsSnapshot.fragmentClipper.contextLength);
    });
  });

  describe('setFragmentConfig()', () => {
    it('merges incoming config with existing fragment config', async () => {
      const partial: Partial<FragmentConfig> = {
        captureContext: false,
        contextLength: 512
      };

      await repo.setFragmentConfig(partial);

      expect(fakeOptionsRepo.setCalls).toEqual([
        {
          fragmentClipper: {
            ...optionsSnapshot.fragmentClipper,
            ...partial
          }
        }
      ]);
    });

    it('reflects merged config when getFragmentConfig is called afterwards', async () => {
      await repo.setFragmentConfig({ contextLength: 321 });
      const config = await repo.getFragmentConfig();
      expect(config.contextLength).toBe(321);
    });
  });

  describe('getTemplateConfig()', () => {
    it('returns cloned template config', async () => {
      const result = await repo.getTemplateConfig();
      expect(result).toEqual(optionsSnapshot.templates);
      expect(result).not.toBe(optionsSnapshot.templates);

      result.article = 'mutated';
      const fresh = await repo.getTemplateConfig();
      expect(fresh.article).toBe(optionsSnapshot.templates.article);
    });
  });

  describe('sendClip()', () => {
    const clipPayload: ClipData = {
      type: 'article',
      title: 'Sample',
      markdown: 'markdown content',
      content: 'markdown',
      url: 'https://example.com'
    };

    it('returns result from messaging repository when successful', async () => {
      const expected: ClipResult = { success: true, filePath: '/vault/sample.md' };
      fakeMessagingRepo.response = expected;

      const result = await repo.sendClip(clipPayload);

      expect(fakeMessagingRepo.lastMessage).toEqual({
        type: 'clip',
        data: clipPayload
      });
      expect(result).toEqual(expected);
    });

    it('returns failure result when messaging throws errors', async () => {
      fakeMessagingRepo.failure = new Error('message failed');

      const result = await repo.sendClip(clipPayload);

      expect(result).toEqual({
        success: false,
        error: 'message failed'
      });
    });

    it('handles non Error exceptions gracefully', async () => {
      fakeMessagingRepo.failure = 'string failure';

      const result = await repo.sendClip(clipPayload);

      expect(result).toEqual({
        success: false,
        error: 'CLIP_REPOSITORY_UNKNOWN_ERROR'
      });
    });
  });

  describe('onConfigChange()', () => {
    it('subscribes to options repository and emits cloned config', () => {
      let emittedConfig: FragmentConfig | null = null;
      const callback = vi.fn((config: FragmentConfig) => {
        emittedConfig = config;
      });
      const unsubscribe = repo.onConfigChange(callback);

      expect(fakeOptionsRepo.onChangeCalls).toBe(1);
      expect(callback).toHaveBeenCalledWith(optionsSnapshot.fragmentClipper);
      expect(emittedConfig).not.toBe(optionsSnapshot.fragmentClipper);

      unsubscribe();
    });

    it('propagates changes when options repository emits new fragment config', () => {
      let latestConfig: FragmentConfig | null = null;
      const callback = vi.fn((config: FragmentConfig) => {
        latestConfig = config;
      });
      repo.onConfigChange(callback);

      const updated = createOptionsSnapshot();
      updated.fragmentClipper.contextLength = 777;
      fakeOptionsRepo.emit(updated);

      expect(callback).toHaveBeenCalledWith(updated.fragmentClipper);
      expect(latestConfig).not.toBe(updated.fragmentClipper);
    });
  });

  describe('environment compatibility', () => {
    it('uses global structuredClone when available for deep cloning', async () => {
      const originalStructuredClone = globalThis.structuredClone;
      let structuredCloneCalls = 0;
      globalThis.structuredClone = <T>(value: T): T => {
        structuredCloneCalls += 1;
        return value;
      };

      try {
        await repo.getFragmentConfig();
        await repo.getTemplateConfig();
        expect(structuredCloneCalls).toBeGreaterThan(0);
      } finally {
        globalThis.structuredClone = originalStructuredClone;
      }
    });

    it('falls back to JSON cloning when structuredClone is unavailable', async () => {
      const originalStructuredClone = globalThis.structuredClone;
      Reflect.deleteProperty(globalThis, 'structuredClone');

      try {
        const fragment = await repo.getFragmentConfig();
        fragment.contextLength = 999;
        const fresh = await repo.getFragmentConfig();
        expect(fresh.contextLength).toBe(optionsSnapshot.fragmentClipper.contextLength);
      } finally {
        globalThis.structuredClone = originalStructuredClone;
      }
    });
  });
});
