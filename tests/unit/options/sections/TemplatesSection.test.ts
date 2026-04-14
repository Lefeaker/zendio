/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configProvider } from '@shared/config';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { TemplatesSection } from '@options/components/sections/TemplatesSection';
import { createOptionsStateManager } from '@options/state/StateManager';
import { DEFAULT_DOMAIN_MAPPINGS } from '@options/utils/defaults';

const createMockFn = <T extends (...args: any[]) => any>() => vi.fn<Parameters<T>, ReturnType<T>>();

const { scheduleAutoSaveMock, markPendingAutoSaveMock } = vi.hoisted(() => ({
  scheduleAutoSaveMock: vi.fn(),
  markPendingAutoSaveMock: vi.fn()
}));

vi.mock('../../../../src/options/app/optionsControllerContext', () => {
  return {
    getOptionsController: () => ({ scheduleAutoSave: scheduleAutoSaveMock }),
    markPendingAutoSave: markPendingAutoSaveMock
  };
});

type DomainMappingsStub = {
  render: ReturnType<typeof vi.fn<[], void>>;
  setMessages: ReturnType<typeof vi.fn<[unknown], void>>;
  setMappings: ReturnType<typeof vi.fn<[Record<string, string>], void>>;
  collect: ReturnType<typeof vi.fn<[], Record<string, string>>>;
  addRow: ReturnType<typeof vi.fn<[string, string, { autoFocus?: boolean }?], void>>;
  dispose: ReturnType<typeof vi.fn<[], void>>;
};

const domainMappingStubs: DomainMappingsStub[] = [];

vi.mock('../../../../src/options/components/controls/domainMappings', () => {
  const DomainMappingsController = vi.fn(() => {
    const stub: DomainMappingsStub = {
      render: vi.fn<[], void>(),
      setMessages: vi.fn<[unknown], void>(),
      setMappings: vi.fn<[Record<string, string>], void>(),
      collect: vi.fn<[], Record<string, string>>().mockReturnValue({}),
      addRow: vi.fn<[string, string, { autoFocus?: boolean }?], void>(),
      dispose: vi.fn<[], void>()
    };
    domainMappingStubs.push(stub);
    return stub;
  });
  return { DomainMappingsController };
});

type ReadingControllerStub = {
  apply: ReturnType<typeof vi.fn<[], void>>;
  collect: ReturnType<typeof vi.fn<[], string>>;
  dispose: ReturnType<typeof vi.fn<[], void>>;
};

const readingControllerStubs: ReadingControllerStub[] = [];

vi.mock('../../../../src/options/components/controls/readingTemplateControls', () => ({
  createReadingTemplateController: vi.fn((deps: { customInput: { value?: string } }) => {
    const controller: ReadingControllerStub = {
      apply: vi.fn<[], void>(),
      collect: vi.fn<[], string>().mockReturnValue(deps.customInput.value ?? ''),
      dispose: vi.fn<[], void>()
    };
    readingControllerStubs.push(controller);
    return controller;
  })
}));

const createOptionsSnapshot = (): CompleteOptions =>
  ({
    templates: { ...configProvider.getTemplates() },
    domainMappings: { ...DEFAULT_DOMAIN_MAPPINGS }
  }) as CompleteOptions;

type OptionsRepositoryMock = IOptionsRepository & {
  get: ReturnType<typeof createMockFn<IOptionsRepository['get']>>;
  set: ReturnType<typeof createMockFn<IOptionsRepository['set']>>;
  onChange: ReturnType<typeof createMockFn<IOptionsRepository['onChange']>>;
};

describe('TemplatesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domainMappingStubs.length = 0;
    readingControllerStubs.length = 0;
  });

  const setupSection = (optionsOverrides?: Partial<CompleteOptions>) => {
    const container = document.createElement('section');
    const optionsSnapshot = {
      ...createOptionsSnapshot(),
      ...optionsOverrides
    } as CompleteOptions;

    let onChangeListener: ((options: CompleteOptions) => void) | null = null;
    const unsubscribe = vi.fn();
    const optionsRepo: OptionsRepositoryMock = {
      get: createMockFn<IOptionsRepository['get']>().mockResolvedValue(optionsSnapshot),
      set: createMockFn<IOptionsRepository['set']>().mockResolvedValue(undefined),
      onChange: createMockFn<IOptionsRepository['onChange']>().mockImplementation((listener) => {
        onChangeListener = listener;
        return unsubscribe;
      })
    };

    const section = new TemplatesSection(container, optionsRepo);
    const stateManager = createOptionsStateManager();
    const formRegistry = new FormSectionRegistry();
    section.render({ stateManager, formRegistry });

    return { section, container, formRegistry, optionsRepo, unsubscribe, getListener: () => onChangeListener };
  };

  it('renders defaults and registers form section', () => {
    const { container, formRegistry } = setupSection();
    const articleInput = container.querySelector<HTMLInputElement>('input[data-template-role="article"]');
    expect(articleInput?.value).toBe(configProvider.getTemplates().article);
    expect(formRegistry.size).toBe(1);
  });

  it('collects template/domain mapping changes and persists via repository', async () => {
    const { container, formRegistry, optionsRepo } = setupSection();
    const articleInput = container.querySelector<HTMLInputElement>('input[data-template-role="article"]');
    const fragmentInput = container.querySelector<HTMLInputElement>('input[data-template-role="fragment"]');
    const aiInput = container.querySelector<HTMLInputElement>('input[data-template-role="ai"]');

    expect(articleInput).toBeTruthy();
    expect(fragmentInput).toBeTruthy();
    expect(aiInput).toBeTruthy();

    if (!articleInput || !fragmentInput || !aiInput) {
      throw new Error('Inputs not found');
    }

    articleInput.value = 'Articles/{yyyy}/{slug}.md';
    fragmentInput.value = 'Fragments/{yyyy}/{slug}.md';
    aiInput.value = ''; // trigger fallback to previous value

    const readingController = readingControllerStubs.at(-1);
    expect(readingController).toBeTruthy();
    readingController?.collect.mockReturnValue('Reading/{yyyy}/{slug}.md');

    const domainController = domainMappingStubs.at(-1);
    expect(domainController).toBeTruthy();
    domainController?.collect.mockReturnValue({
      'mp.weixin.qq.com': '公众号',
      'example.com': 'Example'
    });

    const previousOptions: StoredOptions = {
      templates: {
        article: 'PrevArticle',
        fragment: 'PrevFragment',
        reading: 'PrevReading',
        ai: 'PrevAI'
      },
      domainMappings: {
        'old.com': 'Old'
      }
    };

    const collected = formRegistry.collect(previousOptions);
    expect(collected.templates).toEqual({
      article: 'Articles/{yyyy}/{slug}.md',
      fragment: 'Fragments/{yyyy}/{slug}.md',
      reading: 'Reading/{yyyy}/{slug}.md',
      ai: 'PrevAI'
    });
    expect(collected.domainMappings).toEqual({
      'mp.weixin.qq.com': '公众号',
      'example.com': 'Example'
    });

  });

  it('marks pending auto save and schedules save when template field changes', () => {
    const { container } = setupSection();
    const articleInput = container.querySelector<HTMLInputElement>('input[data-template-role="article"]');
    expect(articleInput).toBeTruthy();

    if (!articleInput) {
      throw new Error('Article input not found');
    }

    articleInput.value = 'Articles/{yyyy}/{slug}.md';
    articleInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(markPendingAutoSaveMock).toHaveBeenCalledWith('templates');
    expect(scheduleAutoSaveMock).toHaveBeenCalledTimes(1);
  });

  it('adds a new domain mapping row when clicking the add mapping button', () => {
    const { container } = setupSection();
    const domainController = domainMappingStubs.at(-1);
    expect(domainController).toBeTruthy();

    const addButton = container.querySelector('button');
    expect(addButton).toBeTruthy();

    addButton?.click();
    expect(domainController?.addRow).toHaveBeenCalledWith('', '', { autoFocus: true });
  });

  it('prefers previous domain mappings when controller returns empty object', () => {
    const { formRegistry } = setupSection();
    const domainController = domainMappingStubs.at(-1);
    expect(domainController).toBeTruthy();
    domainController?.collect.mockReturnValue({});

    const previous = {
      domainMappings: { 'legacy.com': 'Legacy' },
      templates: {}
    } as StoredOptions;

    const result = formRegistry.collect(previous);
    expect(result.domainMappings).toEqual(previous.domainMappings);
  });

  it('falls back to default mappings and template defaults when no previous snapshot exists', async () => {
    const { container, formRegistry, optionsRepo } = setupSection();
    const domainController = domainMappingStubs.at(-1);
    const readingController = readingControllerStubs.at(-1);
    expect(domainController).toBeTruthy();
    expect(readingController).toBeTruthy();

    domainController?.collect.mockReturnValue({});
    readingController?.collect.mockReturnValue('   ');

    const articleInput = container.querySelector<HTMLInputElement>('input[data-template-role="article"]');
    const fragmentInput = container.querySelector<HTMLInputElement>('input[data-template-role="fragment"]');
    const aiInput = container.querySelector<HTMLInputElement>('input[data-template-role="ai"]');
    expect(articleInput && fragmentInput && aiInput).toBeTruthy();

    if (!articleInput || !fragmentInput || !aiInput) {
      throw new Error('Template inputs not found');
    }

    articleInput.value = ' ';
    fragmentInput.value = ' ';
    aiInput.value = '';

    const collected = formRegistry.collect(null);
    expect(collected.templates).toEqual(configProvider.getTemplates());
    expect(collected.domainMappings).toEqual(DEFAULT_DOMAIN_MAPPINGS);

  });

  it('applies repository updates when onChange emits new options', () => {
    const { container, getListener } = setupSection();
    const listener = getListener();
    expect(listener).toBeTruthy();
    const articleInput = container.querySelector<HTMLInputElement>('input[data-template-role="article"]');
    expect(articleInput).toBeTruthy();

    listener?.({
      templates: {
        article: 'Updated/Template.md',
        fragment: 'Fragments',
        ai: 'AI',
        reading: 'Reading'
      }
    } as CompleteOptions);

    expect(articleInput?.value).toBe('Updated/Template.md');
  });

  it('disposes controllers and unsubscribes on destroy', () => {
    const { section, formRegistry, unsubscribe } = setupSection();
    const domainController = domainMappingStubs.at(-1);
    const readingController = readingControllerStubs.at(-1);

    expect(domainController).toBeTruthy();
    expect(readingController).toBeTruthy();

    section.destroy();

    expect(domainController?.dispose).toHaveBeenCalled();
    expect(readingController?.dispose).toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalled();
    expect(formRegistry.size).toBe(0);
  });
});
