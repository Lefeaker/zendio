import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeClipRepository } from '../../../src/infrastructure/repositories/ChromeClipRepository';
import type { IMessagingRepository } from '@shared/repositories';
import type { ClipData, ClipResult, FragmentConfig } from '@shared/repositories/IClipRepository';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { CompleteOptions } from '@shared/types/options';

type MockableFunction = (...args: never[]) => void;

const createMockFn = <T extends MockableFunction>() =>
  vi.fn<(...args: Parameters<T>) => ReturnType<T>>();

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const createOptionsSnapshot = (): CompleteOptions =>
  clone({
    rest: {
      baseUrl: 'https://obsidian.example/',
      httpsUrl: 'https://obsidian.example/',
      httpUrl: 'http://obsidian.example/',
      vault: 'AllInObsidian',
      apiKey: 'test-key'
    },
    templates: {
      article: 'article template',
      fragment: 'fragment template',
      reading: 'reading template',
      ai: 'ai template'
    },
    fragmentClipper: {
      useFootnoteFormat: true,
      captureContext: true,
      contextLength: 200,
      contextMode: 'chars',
      selectionModifierEnabled: false,
      selectionModifierKeys: []
    }
  } as unknown as CompleteOptions);

type OptionsRepoMock = IOptionsRepository & {
  get: ReturnType<typeof createMockFn<IOptionsRepository['get']>>;
  set: ReturnType<typeof createMockFn<IOptionsRepository['set']>>;
  onChange: ReturnType<typeof createMockFn<IOptionsRepository['onChange']>>;
};

type MessagingRepoMock = IMessagingRepository & {
  send: ReturnType<typeof createMockFn<IMessagingRepository['send']>>;
  onMessage: ReturnType<typeof createMockFn<IMessagingRepository['onMessage']>>;
};

describe('ChromeClipRepository', () => {
  let repo: ChromeClipRepository;
  let optionsSnapshot: CompleteOptions;

  const mockOptionsRepo: OptionsRepoMock = {
    get: createMockFn<IOptionsRepository['get']>(),
    set: createMockFn<IOptionsRepository['set']>(),
    onChange: createMockFn<IOptionsRepository['onChange']>()
  };

  const mockMessagingRepo: MessagingRepoMock = {
    send: createMockFn<IMessagingRepository['send']>() as MessagingRepoMock['send'],
    onMessage: createMockFn<IMessagingRepository['onMessage']>()
  };

  beforeEach(() => {
    optionsSnapshot = createOptionsSnapshot();
    mockOptionsRepo.get.mockResolvedValue(optionsSnapshot);
    mockOptionsRepo.set.mockResolvedValue();
    mockOptionsRepo.onChange.mockImplementation((listener) => {
      listener(optionsSnapshot);
      return vi.fn();
    });
    repo = new ChromeClipRepository(mockOptionsRepo, mockMessagingRepo);
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

      expect(mockOptionsRepo.set).toHaveBeenCalledWith({
        fragmentClipper: {
          ...optionsSnapshot.fragmentClipper,
          ...partial
        }
      });
    });

    it('reflects merged config when getFragmentConfig is called afterwards', async () => {
      mockOptionsRepo.set.mockImplementation((payload: Partial<CompleteOptions>) => {
        if (payload.fragmentClipper) {
          optionsSnapshot.fragmentClipper = clone(payload.fragmentClipper);
        }
        return Promise.resolve();
      });

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
      mockMessagingRepo.send.mockResolvedValue(expected);

      const result = await repo.sendClip(clipPayload);

      expect(mockMessagingRepo.send).toHaveBeenCalledWith({
        type: 'clip',
        data: clipPayload
      });
      expect(result).toEqual(expected);
    });

    it('returns failure result when messaging throws errors', async () => {
      mockMessagingRepo.send.mockRejectedValue(new Error('message failed'));

      const result = await repo.sendClip(clipPayload);

      expect(result).toEqual({
        success: false,
        error: 'message failed'
      });
    });

    it('handles non Error exceptions gracefully', async () => {
      mockMessagingRepo.send.mockRejectedValue('string failure');

      const result = await repo.sendClip(clipPayload);

      expect(result).toEqual({
        success: false,
        error: 'Unknown error'
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

      expect(mockOptionsRepo.onChange).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(optionsSnapshot.fragmentClipper);
      expect(emittedConfig).not.toBe(optionsSnapshot.fragmentClipper);

      unsubscribe();
    });

    it('propagates changes when options repository emits new fragment config', () => {
      let listener: ((options: CompleteOptions) => void) | null = null;
      mockOptionsRepo.onChange.mockImplementation((next) => {
        listener = next;
        return vi.fn();
      });
      let latestConfig: FragmentConfig | null = null;
      const callback = vi.fn((config: FragmentConfig) => {
        latestConfig = config;
      });
      repo.onConfigChange(callback);

      const updated = createOptionsSnapshot();
      updated.fragmentClipper.contextLength = 777;
      if (!listener) {
        throw new Error('options listener missing');
      }
      (listener as (options: CompleteOptions) => void)(updated);

      expect(callback).toHaveBeenCalledWith(updated.fragmentClipper);
      expect(latestConfig).not.toBe(updated.fragmentClipper);
    });
  });

  describe('environment compatibility', () => {
    it('uses global structuredClone when available for deep cloning', async () => {
      const globalRef = globalThis as typeof globalThis & { structuredClone?: <T>(value: T) => T };
      const originalStructuredClone = globalRef.structuredClone;
      const structuredSpy = vi.fn<(value: unknown) => unknown>(
        (value) => JSON.parse(JSON.stringify(value)) as unknown
      );
      globalRef.structuredClone = <T>(value: T) => structuredSpy(value) as T;

      try {
        await repo.getFragmentConfig();
        await repo.getTemplateConfig();
        expect(structuredSpy).toHaveBeenCalled();
      } finally {
        globalRef.structuredClone = originalStructuredClone;
      }
    });

    it('falls back to JSON cloning when structuredClone is unavailable', async () => {
      const globalRef = globalThis as typeof globalThis & { structuredClone?: <T>(value: T) => T };
      const originalStructuredClone = globalRef.structuredClone;
      Reflect.deleteProperty(globalRef, 'structuredClone');

      try {
        const fragment = await repo.getFragmentConfig();
        fragment.contextLength = 999;
        const fresh = await repo.getFragmentConfig();
        expect(fresh.contextLength).toBe(optionsSnapshot.fragmentClipper.contextLength);
      } finally {
        globalRef.structuredClone = originalStructuredClone;
      }
    });
  });
});
