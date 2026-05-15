/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IYamlRepository } from '@shared/repositories/IYamlRepository';
import type { YamlConfigService } from '@shared/services/yamlConfigService';
import type {
  ResolvedYamlConfig,
  YamlConfigOverrides,
  YamlContentType
} from '@shared/types/yamlConfig';
import type { YamlConfigControllerOptions } from '../../../../src/ui/domains/yaml-config/yamlConfigTable';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { YamlConfigSection } from '@options/components/sections/YamlConfigSection';
import type { OptionsStateManager } from '@options/state/StateManager';

const createMockFn = <T extends (...args: any[]) => any>() => vi.fn<Parameters<T>, ReturnType<T>>();

const { scheduleAutoSaveMock, markPendingAutoSaveMock } = vi.hoisted(() => {
  const schedule = vi.fn<[section: string], void>();
  const mark = vi.fn<[section: string], void>();
  return {
    scheduleAutoSaveMock: schedule,
    markPendingAutoSaveMock: mark
  };
});

vi.mock('../../../../src/options/app/optionsControllerContext', () => ({
  getOptionsController: () => ({ scheduleAutoSave: scheduleAutoSaveMock }),
  markPendingAutoSave: markPendingAutoSaveMock
}));

type ControllerStub = {
  render: ReturnType<typeof createMockFn<(value: YamlConfigOverrides | null) => void>>;
  collect: ReturnType<typeof createMockFn<() => YamlConfigOverrides | null>>;
  dispose: ReturnType<typeof createMockFn<() => void>>;
  setMessages: ReturnType<typeof createMockFn<(messages: unknown) => void>>;
};

const controllerStubs: ControllerStub[] = [];
let lastControllerOptions: YamlConfigControllerOptions | undefined;

vi.mock('../../../../src/ui/domains/yaml-config/yamlConfigTable', () => {
  return {
    createYamlConfigController: vi.fn((options: YamlConfigControllerOptions) => {
      lastControllerOptions = options;
      const stub: ControllerStub = {
        render: createMockFn<(value: YamlConfigOverrides | null) => void>(),
        collect: createMockFn<() => YamlConfigOverrides | null>().mockReturnValue(null),
        dispose: createMockFn<() => void>(),
        setMessages: createMockFn<(messages: unknown) => void>()
      };
      controllerStubs.push(stub);
      return stub as unknown as ReturnType<
        typeof import('../../../../src/ui/domains/yaml-config/yamlConfigTable').createYamlConfigController
      >;
    })
  };
});

vi.mock('@ui/domains/yaml-config', () => {
  return {
    YamlConfigView: class {
      private readonly controller: ControllerStub;

      constructor(private readonly host: HTMLElement) {
        this.controller = {
          render: createMockFn<(value: YamlConfigOverrides | null) => void>(),
          collect: createMockFn<() => YamlConfigOverrides | null>().mockReturnValue(null),
          dispose: createMockFn<() => void>(),
          setMessages: createMockFn<(messages: unknown) => void>()
        };
        controllerStubs.push(this.controller);
      }

      setMessages(messages: unknown): void {
        this.controller.setMessages(messages);
      }

      render(context: { overrides: YamlConfigOverrides | null; onDirty: () => void }): HTMLElement {
        lastControllerOptions = { tableHost: this.host, onDirty: context.onDirty };
        this.controller.render(context.overrides);
        return this.host;
      }

      update(overrides: YamlConfigOverrides | null): void {
        this.controller.render(overrides);
      }

      collect(): YamlConfigOverrides | null {
        return this.controller.collect();
      }

      destroy(): void {
        this.controller.dispose();
      }
    }
  };
});

const noopStateManager = {} as OptionsStateManager;

const baseOverrides: YamlConfigOverrides = {
  contentTypes: {
    article: {
      fields: [
        { name: 'title', type: 'text', enabled: true },
        { name: 'author', type: 'text', enabled: true }
      ]
    }
  }
};

type YamlRepositoryMock = IYamlRepository & {
  getOverrides: ReturnType<typeof createMockFn<IYamlRepository['getOverrides']>>;
  setOverrides: ReturnType<typeof createMockFn<IYamlRepository['setOverrides']>>;
  onChange: ReturnType<typeof createMockFn<IYamlRepository['onChange']>>;
};

const createYamlRepoStub = (overrides: YamlConfigOverrides | null = baseOverrides) => {
  let changeListener: ((value: YamlConfigOverrides | null) => void) | null = null;
  const unsubscribe = vi.fn(() => {
    changeListener = null;
  });
  const stub: YamlRepositoryMock = {
    getOverrides: createMockFn<IYamlRepository['getOverrides']>().mockResolvedValue(overrides),
    setOverrides: createMockFn<IYamlRepository['setOverrides']>(),
    onChange: createMockFn<IYamlRepository['onChange']>().mockImplementation((listener) => {
      changeListener = listener;
      return unsubscribe;
    })
  };
  return {
    stub,
    emit: (value: YamlConfigOverrides | null) => changeListener?.(value),
    unsubscribe
  };
};

type YamlServiceMock = YamlConfigService & {
  resolveConfig: ReturnType<typeof createMockFn<YamlConfigService['resolveConfig']>>;
  validateYamlConfig: ReturnType<typeof createMockFn<YamlConfigService['validateYamlConfig']>>;
};

const createYamlServiceStub = (
  counts: Partial<Record<YamlContentType, number>> = {
    article: 3,
    clipper: 1,
    video: 0,
    ai_chat: 2
  }
) => {
  const resolveConfig = createMockFn<YamlConfigService['resolveConfig']>().mockImplementation(
    (type: YamlContentType): ResolvedYamlConfig => ({
      contentType: type,
      fields: Array.from({ length: counts[type] ?? 0 }, (_, index) => ({
        name: `${type}-${index}`,
        type: 'text',
        enabled: true
      }))
    })
  );
  const serviceStub: YamlServiceMock = {
    resolveConfig,
    validateYamlConfig:
      createMockFn<YamlConfigService['validateYamlConfig']>().mockReturnValue(null)
  };
  return {
    stub: serviceStub,
    resolveConfig
  };
};

describe('YamlConfigSection', () => {
  let container: HTMLElement;
  let registry: FormSectionRegistry;

  beforeEach(() => {
    document.body.innerHTML = '<section id="yaml"></section>';
    const host = document.getElementById('yaml');
    if (!(host instanceof HTMLElement)) {
      throw new Error('YAML container missing');
    }
    container = host;
    registry = new FormSectionRegistry();
    controllerStubs.length = 0;
    lastControllerOptions = undefined;
    vi.clearAllMocks();
  });

  it('renders repository overrides and summary counts', async () => {
    const repo = createYamlRepoStub(baseOverrides);
    const service = createYamlServiceStub({
      article: 3,
      clipper: 1,
      video: 2,
      ai_chat: 4
    });
    const section = new YamlConfigSection(container, {
      yamlRepository: repo.stub,
      yamlService: service.stub
    });
    section.render({ stateManager: noopStateManager, formRegistry: registry });

    await vi.waitFor(() => {
      expect(repo.stub.getOverrides).toHaveBeenCalled();
      expect(controllerStubs[0]?.render).toHaveBeenCalledWith(baseOverrides);
    });

    await vi.waitFor(() => {
      expect(service.resolveConfig).toHaveBeenCalledTimes(4);
    });

    expect(section['summaryEl']?.textContent).toBe(
      'Article: 3 · Clipper: 1 · Video: 2 · AI Chat: 4'
    );
    section.destroy();
  });

  it('collects overrides via form registry and refreshes summary', async () => {
    const repo = createYamlRepoStub(null);
    const service = createYamlServiceStub();
    const section = new YamlConfigSection(container, {
      yamlRepository: repo.stub,
      yamlService: service.stub
    });
    section.render({ stateManager: noopStateManager, formRegistry: registry });

    await vi.waitFor(() => {
      expect(controllerStubs[0]).toBeTruthy();
    });

    const controller = controllerStubs[0];
    const collected: YamlConfigOverrides = {
      contentTypes: {
        video: {
          fields: [{ name: 'duration', type: 'number', enabled: true }]
        }
      }
    };
    controller.collect.mockReturnValue(collected);

    const previousCalls = service.resolveConfig.mock.calls.length;
    const result = registry.collect(null);
    expect(result.yamlConfig).toEqual(collected);
    expect(service.resolveConfig.mock.calls.length).toBe(previousCalls + 4);
    section.destroy();
  });

  it('marks pending auto save when YAML controller signals dirty state', async () => {
    const repo = createYamlRepoStub(baseOverrides);
    const service = createYamlServiceStub();
    const section = new YamlConfigSection(container, {
      yamlRepository: repo.stub,
      yamlService: service.stub
    });
    section.render({ stateManager: noopStateManager, formRegistry: registry });

    await vi.waitFor(() => {
      expect(lastControllerOptions?.onDirty).toBeTypeOf('function');
    });

    lastControllerOptions?.onDirty?.();
    expect(markPendingAutoSaveMock).toHaveBeenCalledWith('yamlConfig');
    expect(scheduleAutoSaveMock).toHaveBeenCalledTimes(1);
    section.destroy();
  });

  it('re-renders controller and summary when repository emits changes', async () => {
    const repo = createYamlRepoStub(baseOverrides);
    const service = createYamlServiceStub();
    const section = new YamlConfigSection(container, {
      yamlRepository: repo.stub,
      yamlService: service.stub
    });
    section.render({ stateManager: noopStateManager, formRegistry: registry });

    await vi.waitFor(() => {
      expect(controllerStubs[0]).toBeTruthy();
    });
    const controller = controllerStubs[0];
    controller.render.mockClear();
    service.resolveConfig.mockClear();

    const nextOverrides: YamlConfigOverrides = {
      contentTypes: {
        clipper: { fields: [{ name: 'source', type: 'text', enabled: true }] }
      }
    };
    repo.emit(nextOverrides);

    await vi.waitFor(() => {
      expect(controller.render).toHaveBeenCalledWith(nextOverrides);
      expect(service.resolveConfig).toHaveBeenCalledTimes(4);
    });
    section.destroy();
  });

  it('cleans up controller and subscriptions on destroy', async () => {
    const repo = createYamlRepoStub(baseOverrides);
    const service = createYamlServiceStub();
    const section = new YamlConfigSection(container, {
      yamlRepository: repo.stub,
      yamlService: service.stub
    });
    section.render({ stateManager: noopStateManager, formRegistry: registry });

    await vi.waitFor(() => {
      expect(controllerStubs[0]).toBeTruthy();
    });
    const controller = controllerStubs[0];

    section.destroy();
    expect(controller.dispose).toHaveBeenCalled();
    expect(repo.unsubscribe).toHaveBeenCalled();
    expect(registry.size).toBe(0);
  });

  it('warns and keeps placeholder summary when repository bootstrap fails', async () => {
    const repo = createYamlRepoStub(baseOverrides);
    repo.stub.getOverrides.mockRejectedValueOnce(new Error('load failed'));
    const service = createYamlServiceStub({});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const section = new YamlConfigSection(container, {
      yamlRepository: repo.stub,
      yamlService: service.stub
    });
    section.render({ stateManager: noopStateManager, formRegistry: registry });

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
    expect(section['summaryEl']?.textContent).toBe('…');
    warn.mockRestore();
    section.destroy();
  });
});
