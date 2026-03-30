/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { DEFAULT_TAXONOMY_CONFIG } from '@shared/types/taxonomy';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { ClassifierSection } from '@options/components/sections/ClassifierSection';
import type { OptionsStateManager } from '@options/state/StateManager';
import { MockOptionsRepository } from '../../../utils/repositories';

const classifierMocks = vi.hoisted(() => {
  const scheduleAutoSave = vi.fn();
  const parseTaxonomy = vi.fn();
  return {
    scheduleAutoSave,
    parseTaxonomy
  };
}) as {
  scheduleAutoSave: ReturnType<typeof vi.fn>;
  parseTaxonomy: ReturnType<typeof vi.fn>;
};

vi.mock('@options/app/optionsControllerContext', () => ({
  getOptionsController: () => ({
    scheduleAutoSave: classifierMocks.scheduleAutoSave
  }),
  markPendingAutoSave: vi.fn()
}));

vi.mock('@options/services/validation', () => ({
  parseClassifierTaxonomy: (raw: string) => classifierMocks.parseTaxonomy(raw)
}));

const noopStateManager = {} as OptionsStateManager;

describe('ClassifierSection', () => {
  let registry: FormSectionRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    classifierMocks.parseTaxonomy.mockImplementation((raw: string) => JSON.parse(raw));
    document.body.innerHTML = '<section id="classifier-section"></section>';
    registry = new FormSectionRegistry();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    registry.clear();
  });

  const renderSection = (): { section: ClassifierSection; repo: MockOptionsRepository } => {
    const container = document.getElementById('classifier-section');
    if (!container) {
      throw new Error('Classifier container missing');
    }
    const repo = new MockOptionsRepository();
    const section = new ClassifierSection(container, repo);
    section.render({ stateManager: noopStateManager, formRegistry: registry });
    return { section, repo };
  };

  it('shows classifier config when enabled and schedules auto save', () => {
    const { section } = renderSection();
    const enableInput = document.getElementById('clsEnable');
    const configWrapper = document.getElementById('classifierConfig');
    const unstableNote = document.getElementById('classifierUnstableNote');
    if (!(enableInput instanceof HTMLInputElement) || !configWrapper || !unstableNote) {
      throw new Error('Classifier controls missing');
    }

    expect(enableInput.checked).toBe(false);
    expect(configWrapper.style.display).toBe('none');
    expect(unstableNote.style.display).toBe('none');
    section.syncNoticeState();

    enableInput.checked = true;
    enableInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(configWrapper.style.display).toBe('grid');
    expect(unstableNote.style.display).toBe('block');
    expect(classifierMocks.scheduleAutoSave).toHaveBeenCalledTimes(1);

    section.destroy();
  });

  it('applies snapshot and collects classifier changes with taxonomy fallback', async () => {
    const { section, repo } = renderSection();

    const snapshot = {
      classifier: {
        enabled: true,
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiKey: 'secret',
        taxonomy: DEFAULT_TAXONOMY_CONFIG
      }
    } as StoredOptions;

    await registry.apply(snapshot);

    const providerSelect = document.getElementById('clsProvider') as HTMLSelectElement;
    const endpointInput = document.getElementById('clsEndpoint') as HTMLInputElement;
    const taxonomyTextarea = document.getElementById('clsTax') as HTMLTextAreaElement;

    expect(providerSelect.value).toBe('openai');
    expect(endpointInput.value).toBe('https://api.openai.com/v1');
    expect(JSON.parse(taxonomyTextarea.value)).toEqual(
      JSON.parse(JSON.stringify(DEFAULT_TAXONOMY_CONFIG))
    );

    providerSelect.value = 'ollama';
    endpointInput.value = 'http://localhost:11434/api/chat';
    taxonomyTextarea.value = '{invalid json}';
    classifierMocks.parseTaxonomy.mockImplementation(() => {
      throw new Error('invalid taxonomy');
    });

    const previous = {
      classifier: {
        enabled: true,
        provider: 'openai',
        endpoint: 'https://fallback.endpoint',
        model: 'gpt-4o-mini',
        apiKey: 'secret',
        taxonomy: DEFAULT_TAXONOMY_CONFIG
      }
    } as StoredOptions;

    const changes = registry.collect(previous);
    expect(changes.classifier).toBeDefined();
    expect(changes.classifier?.enabled).toBe(true);
    expect(changes.classifier?.provider).toBe('ollama');
    expect(changes.classifier?.endpoint).toBe('http://localhost:11434/api/chat');
    expect(changes.classifier?.taxonomy).toEqual(DEFAULT_TAXONOMY_CONFIG);
    await vi.waitFor(() => {
      expect(repo.getMockData().classifier?.provider).toBe('ollama');
    });

    section.destroy();
  });

  it('updates UI when repository snapshot changes and stops after destroy', async () => {
    const { section, repo } = renderSection();
    const applySpy = vi.spyOn(
      section as unknown as { applySnapshot: (options: StoredOptions) => void },
      'applySnapshot'
    );

    await repo.set({
      classifier: {
        enabled: true,
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        apiKey: 'key',
        taxonomy: DEFAULT_TAXONOMY_CONFIG
      }
    } as Partial<CompleteOptions>);

    await vi.waitFor(() => {
      const providerSelect = document.getElementById('clsProvider') as HTMLSelectElement | null;
      expect(providerSelect?.value).toBe('openai');
    });

    section.destroy();
    applySpy.mockClear();
    await repo.set({
      classifier: {
        enabled: false,
        provider: 'compatible',
        endpoint: 'http://localhost',
        model: 'custom',
        apiKey: '',
        taxonomy: DEFAULT_TAXONOMY_CONFIG
      }
    } as Partial<CompleteOptions>);
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('schedules auto save for each value input and restores defaults on sparse snapshots', async () => {
    const { section } = renderSection();
    await registry.apply({ classifier: { enabled: true } } as StoredOptions);

    const providerSelect = document.getElementById('clsProvider') as HTMLSelectElement;
    const endpointInput = document.getElementById('clsEndpoint') as HTMLInputElement;
    const modelInput = document.getElementById('clsModel') as HTMLInputElement;
    const apiKeyInput = document.getElementById('clsKey') as HTMLInputElement;
    const taxonomyTextarea = document.getElementById('clsTax') as HTMLTextAreaElement;
    const configWrapper = document.getElementById('classifierConfig');
    if (!(configWrapper instanceof HTMLElement)) {
      throw new Error('Classifier config wrapper missing');
    }

    expect(configWrapper.style.display).toBe('grid');
    expect(providerSelect.value).toBe('ollama');
    expect(endpointInput.value).toBe('http://localhost:11434/api/chat');
    expect(modelInput.value).toBe('llama3.1');
    expect(apiKeyInput.value).toBe('');
    expect(taxonomyTextarea.value).toContain('version');

    providerSelect.dispatchEvent(new Event('change', { bubbles: true }));
    endpointInput.dispatchEvent(new Event('input', { bubbles: true }));
    modelInput.dispatchEvent(new Event('input', { bubbles: true }));
    apiKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
    taxonomyTextarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(classifierMocks.scheduleAutoSave).toHaveBeenCalledTimes(5);
    section.destroy();
  });

  it('collects parsed taxonomy when valid and falls back to defaults when previous snapshot is missing', () => {
    const { section } = renderSection();
    const enableInput = document.getElementById('clsEnable') as HTMLInputElement;
    const taxonomyTextarea = document.getElementById('clsTax') as HTMLTextAreaElement;

    enableInput.checked = true;
    enableInput.dispatchEvent(new Event('change', { bubbles: true }));
    taxonomyTextarea.value = JSON.stringify(DEFAULT_TAXONOMY_CONFIG);

    const changes = registry.collect(null);
    expect(changes.classifier?.provider).toBe('ollama');
    expect(changes.classifier?.endpoint).toBe('http://localhost:11434/api/chat');
    expect(changes.classifier?.model).toBe('llama3.1');
    expect(changes.classifier?.taxonomy).toEqual(DEFAULT_TAXONOMY_CONFIG);
    section.destroy();
  });

  it('falls back to default taxonomy when the textarea is blank', () => {
    const { section } = renderSection();
    const enableInput = document.getElementById('clsEnable') as HTMLInputElement;
    const taxonomyTextarea = document.getElementById('clsTax') as HTMLTextAreaElement;
    const endpointInput = document.getElementById('clsEndpoint') as HTMLInputElement;
    const modelInput = document.getElementById('clsModel') as HTMLInputElement;

    enableInput.checked = true;
    enableInput.dispatchEvent(new Event('change', { bubbles: true }));
    endpointInput.value = 'http://localhost:11434/api/chat';
    modelInput.value = 'llama3';
    taxonomyTextarea.value = '   ';
    classifierMocks.parseTaxonomy.mockImplementation(() => {
      throw new Error('blank taxonomy');
    });

    const changes = registry.collect({
      classifier: { taxonomy: DEFAULT_TAXONOMY_CONFIG }
    } as StoredOptions);
    expect(changes.classifier?.taxonomy).toEqual(DEFAULT_TAXONOMY_CONFIG);
    section.destroy();
  });
});
