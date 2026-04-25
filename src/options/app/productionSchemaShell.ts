import type { Messages } from '@i18n';
import type { Language } from '@i18n/locales';
import type { StorageService } from '@platform/interfaces/storage';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { setPath } from '@options/schema-runtime/binding';
import { createActionRuntime } from '@options/schema-runtime/actionRuntime';
import { createSchemaRenderer } from '@options/schema-runtime/renderer';
import { createSchemaStore } from '@options/schema-runtime/store';
import { el, clear } from '@options/schema-runtime/dom';
import type {
  WidgetFactory,
  WidgetMountContract,
  WidgetRuntime
} from '@options/schema-runtime/contracts';
import { persistTransferLogAction } from '@options/app/actions';
import { resolveSchemaMessage } from '@options/schema/content';
import {
  createSchemaShellAppData,
  createResourceSchemas,
  createSettingsSchemas
} from '@options/schema/registry';
import type {
  SchemaShellAppData,
  SchemaShellState,
  OptionsSchemaPanelId,
  OptionsSchemaResourceId
} from '@options/schema/model';
import type { OptionsController } from '@options/app/optionsController';
import type {
  IOptionsRepository,
  IMessagingRepository,
  IYamlRepository
} from '@shared/repositories';

export interface MountedProductionSchemaShell {
  cleanup: () => void;
  collectDraft: () => CompleteOptions;
  refreshOptions: (options?: StoredOptions | CompleteOptions | null) => void;
  setMessages: (messages: Messages | null, language: string) => void;
}

export interface ProductionSchemaShellDependencies {
  container: HTMLElement;
  controller: OptionsController;
  storage: StorageService;
  optionsRepository: IOptionsRepository;
  messagingRepository: IMessagingRepository;
  yamlRepository: IYamlRepository;
  messages: Messages | null;
  language: string;
  onChangeLanguage: (language: Language) => Promise<Language>;
  onCopyConfig: () => Promise<void>;
  onImportConfig: () => Promise<void>;
  onSave: () => Promise<void>;
  onRunDiagnostics: () => Promise<void>;
  onFixConfiguration: () => Promise<void>;
  onReloadDiagnostics: () => Promise<void>;
  widgetFactories?: Record<string, WidgetFactory<SchemaShellState, SchemaShellAppData>>;
}

function cloneOptions<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveReadingPathMode(options: CompleteOptions): string {
  const reading = options.templates.reading?.trim() ?? '';
  if (reading === (options.templates.article?.trim() ?? '')) {
    return 'article';
  }
  if (reading === (options.templates.fragment?.trim() ?? '')) {
    return 'fragment';
  }
  return 'custom';
}

function buildTransferLogMessage(
  options: StoredOptions | CompleteOptions | null | undefined,
  messages: Messages | null
): string | null {
  const log = (
    options as
      | { transferLog?: { lastAction: 'copy' | 'import'; timestamp: number } }
      | null
      | undefined
  )?.transferLog;
  if (!log) {
    return null;
  }
  const date = new Date(log.timestamp).toLocaleString();
  const status =
    log.lastAction === 'copy'
      ? resolveSchemaMessage(messages, 'schemaMaintenanceTransferLogCopySuccess')
      : resolveSchemaMessage(messages, 'schemaMaintenanceTransferLogImportSuccess');
  return `${date} · ${status}`;
}

function readDiagnosticOutput(): string {
  const output = document.getElementById('diagOutput');
  return output?.textContent ?? '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeRecord(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (isRecord(value) && isRecord(target[key])) {
      mergeRecord(target[key], value);
      continue;
    }
    target[key] = cloneOptions(value);
  }
}

class LazyWidgetProxy<Props, State, AppData> implements WidgetMountContract<Props, State, AppData> {
  private instance: WidgetMountContract<Props, State, AppData> | null = null;
  private pending: Promise<WidgetMountContract<Props, State, AppData>> | null = null;
  private mountedArgs: [HTMLElement, Props, WidgetRuntime<State, AppData> | undefined] | null =
    null;
  private latestUpdate: [Props, WidgetRuntime<State, AppData> | undefined] | null = null;
  private destroyed = false;

  constructor(
    private readonly instantiate: () => Promise<WidgetMountContract<Props, State, AppData>>
  ) {}

  private ensureInstance(): Promise<WidgetMountContract<Props, State, AppData>> {
    if (this.instance) {
      return Promise.resolve(this.instance);
    }
    if (!this.pending) {
      this.pending = this.instantiate().then(async (widget) => {
        this.instance = widget;
        if (this.destroyed) {
          widget.destroy();
          return widget;
        }
        if (this.mountedArgs) {
          await widget.mount(...this.mountedArgs);
        }
        if (this.latestUpdate) {
          await widget.update(...this.latestUpdate);
        }
        return widget;
      });
    }
    return this.pending;
  }

  mount(
    container: HTMLElement,
    props: Props,
    runtime?: WidgetRuntime<State, AppData>
  ): void | Promise<void> {
    this.mountedArgs = [container, props, runtime];
    if (this.instance) {
      return this.instance.mount(container, props, runtime);
    }
    void this.ensureInstance();
  }

  update(props: Props, runtime?: WidgetRuntime<State, AppData>): void | Promise<void> {
    this.latestUpdate = [props, runtime];
    if (this.instance) {
      return this.instance.update(props, runtime);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.instance?.destroy();
  }

  collect(): unknown {
    return this.instance?.collect?.();
  }

  applySnapshot(snapshot: unknown): void | Promise<void> {
    return this.instance?.applySnapshot?.(snapshot);
  }
}

function createLazyWidgetFactory<State, AppData>(
  instantiate: () => Promise<WidgetMountContract<unknown, State, AppData>>
): WidgetFactory<State, AppData> {
  return () => new LazyWidgetProxy<unknown, State, AppData>(instantiate);
}

export function mountProductionSchemaShell(
  dependencies: ProductionSchemaShellDependencies
): MountedProductionSchemaShell {
  const settingsSchemas = createSettingsSchemas(dependencies.messages);
  const settingsMap = new Map(settingsSchemas.map((schema) => [schema.id, schema]));
  let resourceSchemas = createResourceSchemas(dependencies.messages);
  let resourceMap = new Map(resourceSchemas.map((schema) => [schema.id, schema]));

  let appData = createSchemaShellAppData(dependencies.messages);
  const initialOptions = dependencies.controller.readForm();
  const store = createSchemaStore<SchemaShellState>({
    activePanel: 'overview',
    activeResource: null,
    language: dependencies.language,
    options: cloneOptions(initialOptions),
    readingPathMode: resolveReadingPathMode(initialOptions),
    yamlFilter: 'all',
    activeTemplateField: 'article',
    transferLogMessage: buildTransferLogMessage(initialOptions, dependencies.messages),
    diagnosisVisible: false,
    diagnosisOutput: ''
  });

  let rendererInstance: ReturnType<
    typeof createSchemaRenderer<SchemaShellState, SchemaShellAppData>
  > | null = null;
  let optionsUnsubscribe: (() => void) | null = null;
  let mainScrollCleanup: (() => void) | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const defaultWidgetFactories: Record<
    string,
    WidgetFactory<SchemaShellState, SchemaShellAppData>
  > = {
    usage: createLazyWidgetFactory(async () => {
      const { UsageWidget } = await import('@options/widgets/UsageWidget');
      return new UsageWidget({
        optionsRepository: dependencies.optionsRepository,
        messagingRepository: dependencies.messagingRepository,
        storage: dependencies.storage
      }) as never;
    }),
    privacy: createLazyWidgetFactory(async () => {
      const { PrivacyWidget } = await import('@options/widgets/PrivacyWidget');
      return new PrivacyWidget({
        optionsRepository: dependencies.optionsRepository
      }) as never;
    }),
    restStorage: createLazyWidgetFactory(async () => {
      const { RestStorageWidget } = await import('@options/widgets/RestStorageWidget');
      return new RestStorageWidget({
        optionsRepository: dependencies.optionsRepository,
        messagingRepository: dependencies.messagingRepository
      }) as never;
    }),
    vaultRouter: createLazyWidgetFactory(async () => {
      const { VaultRouterWidget } = await import('@options/widgets/VaultRouterWidget');
      return new VaultRouterWidget({ optionsRepository: dependencies.optionsRepository }) as never;
    }),
    yamlConfig: createLazyWidgetFactory(async () => {
      const { YamlConfigWidget } = await import('@options/widgets/YamlConfigWidget');
      return new YamlConfigWidget({ yamlRepository: dependencies.yamlRepository }) as never;
    }),
    templates: createLazyWidgetFactory(async () => {
      const { TemplatesWidget } = await import('@options/widgets/TemplatesWidget');
      return new TemplatesWidget() as never;
    }),
    domainMappings: createLazyWidgetFactory(async () => {
      const { DomainMappingsWidget } = await import('@options/widgets/DomainMappingsWidget');
      return new DomainMappingsWidget() as never;
    }),
    videoSettings: createLazyWidgetFactory(async () => {
      const { VideoSettingsWidget } = await import('@options/widgets/VideoSettingsWidget');
      return new VideoSettingsWidget(dependencies.optionsRepository) as never;
    }),
    readingSettings: createLazyWidgetFactory(async () => {
      const { ReadingSettingsWidget } = await import('@options/widgets/ReadingSettingsWidget');
      return new ReadingSettingsWidget(dependencies.optionsRepository) as never;
    }),
    fragmentSettings: createLazyWidgetFactory(async () => {
      const { FragmentSettingsWidget } = await import('@options/widgets/FragmentSettingsWidget');
      return new FragmentSettingsWidget(dependencies.optionsRepository) as never;
    })
  };
  const widgetFactories = dependencies.widgetFactories ?? defaultWidgetFactories;

  function getSettingsView(panelId: OptionsSchemaPanelId) {
    const schema = settingsMap.get(panelId);
    return schema?.createView({ state: store.getState(), appData }) ?? null;
  }

  function getResourceView(resourceId: OptionsSchemaResourceId) {
    const schema = resourceMap.get(resourceId);
    return schema?.createView({ state: store.getState(), appData }) ?? null;
  }

  function scheduleFullSave(_source: string): void {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      syncMountedWidgetState();
      void dependencies.controller.saveSnapshot({
        reason: 'auto',
        draft: cloneOptions(store.getState().options)
      });
    }, 250);
  }

  function syncMountedWidgetState(): boolean {
    const drafts = rendererInstance?.collectWidgetState() ?? [];
    if (!drafts.length) {
      return false;
    }

    const before = JSON.stringify(store.getState().options);
    store.mutate(
      (state) => {
        drafts.forEach((draft) => {
          if (!isRecord(draft)) {
            return;
          }
          mergeRecord(state.options as unknown as Record<string, unknown>, draft);
        });
        state.readingPathMode = resolveReadingPathMode(state.options);
      },
      { silent: true }
    );

    const after = JSON.stringify(store.getState().options);
    if (before === after) {
      return false;
    }

    dependencies.controller.setSnapshot(store.getState().options as StoredOptions);
    return true;
  }

  const actionRuntime = createActionRuntime<SchemaShellState, SchemaShellAppData>({
    getContext: () => ({ state: store.getState(), appData }),
    mutate(mutator, options) {
      store.mutate(mutator, options);
      if (!options?.silent) {
        render();
      }
    },
    handlers: {
      'navigation:activatePanel': ({ args, mutate }) => {
        const panel = (args[0] ?? 'overview') as OptionsSchemaPanelId;
        mutate(
          (state) => {
            state.activePanel = panel;
          },
          { silent: true }
        );
        syncActiveLinks(dependencies.container);
        scrollToPanel(panel);
      },
      'resource:open': ({ args, mutate }) => {
        const resourceId = (args[0] ?? null) as OptionsSchemaResourceId | null;
        if (!resourceId) {
          return;
        }
        const resource = resourceMap.get(resourceId);
        if (!resource) {
          return;
        }
        if (resource.openMode === 'page') {
          const changed = syncMountedWidgetState();
          if (changed) {
            scheduleFullSave('resource');
          }
          window.open(resource.href ?? '../onboarding/index.html', '_blank', 'noopener,noreferrer');
          return;
        }
        mutate(
          (state) => {
            state.activeResource = resourceId;
          },
          { silent: true }
        );
        render({ flushWidgets: true, saveSource: 'resource' });
      },
      'resource:close': ({ mutate }) => {
        mutate(
          (state) => {
            state.activeResource = null;
          },
          { silent: true }
        );
        render({ flushWidgets: true, saveSource: 'resource' });
      },
      'options:setValue': ({ args, value, mutate }) => {
        const path = String(args[0] ?? '');
        mutate(
          (state) => {
            setPath(state.options as unknown as Record<string, unknown>, path, value);
            state.readingPathMode = resolveReadingPathMode(state.options);
          },
          { silent: true }
        );
        dependencies.controller.setSnapshot(store.getState().options as StoredOptions);
        scheduleFullSave(path);
        render({ flushWidgets: true });
      },
      'aiChat:updateUserName': ({ value, mutate }) => {
        const userName = String(value ?? '').trim() || 'USER';
        mutate(
          (state) => {
            state.options.aiChat = {
              ...state.options.aiChat,
              userName,
              includeTimestamps: false
            };
          },
          { silent: true }
        );
        dependencies.controller.setSnapshot(store.getState().options as StoredOptions);
        scheduleFullSave('aiChat');
        render({ flushWidgets: true });
      },
      'options:changeLanguage': ({ value, mutate }) => {
        void (async () => {
          const resolved = await dependencies.onChangeLanguage(String(value ?? 'en') as Language);
          mutate(
            (state) => {
              state.language = resolved;
            },
            { silent: true }
          );
          render();
        })();
      },
      'maintenance:copyConfig': ({ mutate }) => {
        void (async () => {
          await dependencies.onCopyConfig();
          const entry = await persistTransferLogAction('copy', {
            optionsRepository: dependencies.optionsRepository,
            now: Date.now
          });
          mutate(
            (state) => {
              (state.options as Record<string, unknown>).transferLog = entry;
              state.transferLogMessage = buildTransferLogMessage(
                { transferLog: entry },
                appData.messages
              );
            },
            { silent: true }
          );
          dependencies.controller.setSnapshot(store.getState().options as StoredOptions);
          render();
        })();
      },
      'maintenance:importConfig': ({ mutate }) => {
        void (async () => {
          await dependencies.onImportConfig();
          const fresh = dependencies.controller.readForm();
          const entry = await persistTransferLogAction('import', {
            optionsRepository: dependencies.optionsRepository,
            now: Date.now
          });
          mutate(
            (state) => {
              state.options = cloneOptions(fresh);
              (state.options as Record<string, unknown>).transferLog = entry;
              state.transferLogMessage = buildTransferLogMessage(
                { transferLog: entry },
                appData.messages
              );
              state.readingPathMode = resolveReadingPathMode(state.options);
            },
            { silent: true }
          );
          render();
        })();
      },
      'maintenance:save': () => {
        void dependencies.onSave();
      },
      'maintenance:runDiagnostics': ({ mutate }) => {
        void (async () => {
          await dependencies.onRunDiagnostics();
          mutate(
            (state) => {
              state.diagnosisVisible = true;
              state.diagnosisOutput = readDiagnosticOutput();
            },
            { silent: true }
          );
          render();
        })();
      },
      'maintenance:fixConfiguration': ({ mutate }) => {
        void (async () => {
          await dependencies.onFixConfiguration();
          mutate(
            (state) => {
              state.diagnosisVisible = true;
              state.diagnosisOutput = readDiagnosticOutput();
            },
            { silent: true }
          );
          render();
        })();
      },
      'maintenance:reloadDiagnostics': ({ mutate }) => {
        void (async () => {
          await dependencies.onReloadDiagnostics();
          mutate(
            (state) => {
              state.diagnosisVisible = true;
              state.diagnosisOutput = readDiagnosticOutput();
            },
            { silent: true }
          );
          render();
        })();
      }
    },
    onUnhandledAction(descriptor) {
      console.warn('[ProductionSchemaShell] Unhandled action:', descriptor.id);
    }
  });

  function buildSidebar(): HTMLElement {
    const state = store.getState();
    return el(
      'aside',
      { className: 'schema-shell-sidebar' },
      el(
        'div',
        { className: 'schema-shell-brand' },
        el('strong', { text: appData.brand.title }),
        el('span', { text: appData.brand.subtitle })
      ),
      el(
        'div',
        { className: 'schema-shell-nav-group' },
        el('div', { className: 'schema-shell-nav-title', text: appData.settingsGroupTitle }),
        el(
          'nav',
          { className: 'schema-shell-nav' },
          appData.nav.map((item) =>
            el(
              'button',
              {
                type: 'button',
                className: state.activePanel === item.id ? 'is-active' : '',
                dataset: { navPanel: item.id },
                onClick: () =>
                  actionRuntime.dispatch({ id: 'navigation:activatePanel', args: [item.id] })
              },
              el('span', {}, el('strong', { text: item.label }), el('span', { text: item.hint }))
            )
          )
        )
      ),
      el(
        'div',
        { className: 'schema-shell-sidebar-footer' },
        ...appData.resources.map((group) =>
          el(
            'div',
            { className: 'schema-shell-resource-group' },
            el('div', { className: 'schema-shell-nav-title', text: group.title }),
            group.items.map((item) =>
              el('button', {
                type: 'button',
                className:
                  state.activeResource === item.id
                    ? 'schema-shell-resource-link is-active'
                    : 'schema-shell-resource-link',
                dataset: { footerPanel: item.id },
                text: item.label,
                title: item.hint,
                onClick: () => actionRuntime.dispatch({ id: 'resource:open', args: [item.id] })
              })
            )
          )
        )
      )
    );
  }

  function buildPanelSection(panelId: OptionsSchemaPanelId): HTMLElement {
    const view = getSettingsView(panelId);
    return el(
      'section',
      {
        className: 'schema-panel-section',
        id: `section-${panelId}`,
        dataset: {
          panelId,
          scrollSection: 'true'
        }
      },
      view ? (rendererInstance?.renderView(view) ?? null) : null
    );
  }

  function buildMain(): HTMLElement {
    rendererInstance = createSchemaRenderer<SchemaShellState, SchemaShellAppData>({
      getContext: () => ({ state: store.getState(), appData }),
      dispatch: (action, payload) => actionRuntime.dispatch(action, payload),
      mutate(mutator, options) {
        store.mutate(mutator, options);
      },
      notifyDirty(keys) {
        syncMountedWidgetState();
        scheduleFullSave(keys?.[0] ?? 'schema');
      },
      reportError(scope, error) {
        console.error(`[ProductionSchemaShell][${scope}]`, error);
      },
      requestRerender: () => render({ flushWidgets: true }),
      getWidgetFactory(widgetType) {
        return widgetFactories[widgetType] ?? null;
      }
    });

    return el(
      'main',
      { className: 'schema-shell-main' },
      el(
        'div',
        { className: 'schema-shell-content' },
        el(
          'div',
          { className: 'schema-panel-stack' },
          appData.panelOrder.map((panelId) => buildPanelSection(panelId))
        )
      )
    );
  }

  function buildResourceOverlay(): HTMLElement | null {
    const resourceId = store.getState().activeResource;
    if (!resourceId) {
      return null;
    }
    const view = getResourceView(resourceId);
    if (!view || !rendererInstance) {
      return null;
    }
    return rendererInstance.renderView(view);
  }

  function render(options: { flushWidgets?: boolean; saveSource?: string } = {}): void {
    const previousScrollTop =
      dependencies.container.querySelector<HTMLElement>('.schema-shell-main')?.scrollTop ?? 0;
    if (options.flushWidgets) {
      const changed = syncMountedWidgetState();
      if (changed && options.saveSource) {
        scheduleFullSave(options.saveSource);
      }
    }
    mainScrollCleanup?.();
    mainScrollCleanup = null;
    rendererInstance?.dispose();
    rendererInstance = null;
    const app = el(
      'div',
      { className: 'schema-shell-app' },
      buildSidebar(),
      buildMain(),
      buildResourceOverlay()
    );
    clear(dependencies.container).append(app);
    const main = app.querySelector<HTMLElement>('.schema-shell-main');
    if (main) {
      main.scrollTop = previousScrollTop;
    }
    syncActiveLinks(dependencies.container);
    mainScrollCleanup = bindScrollSync(dependencies.container);
  }

  function scrollToPanel(panelId: OptionsSchemaPanelId): void {
    const main = dependencies.container.querySelector<HTMLElement>('.schema-shell-main');
    const section = dependencies.container.querySelector<HTMLElement>(
      `[data-panel-id="${panelId}"]`
    );
    if (!main || !section) {
      return;
    }

    const nextTop = Math.max(section.offsetTop - 12, 0);
    if (typeof main.scrollTo === 'function') {
      main.scrollTo({
        top: nextTop,
        behavior: 'smooth'
      });
      return;
    }

    main.scrollTop = nextTop;
  }

  function bindScrollSync(target: HTMLElement): (() => void) | null {
    const main = target.querySelector<HTMLElement>('.schema-shell-main');
    const sections = Array.from(
      target.querySelectorAll<HTMLElement>('[data-scroll-section="true"]')
    );
    if (!main || sections.length === 0) {
      return null;
    }

    let rafId = 0;
    const sync = (): void => {
      rafId = 0;
      const threshold = main.scrollTop + 120;
      let nextActive = sections[0]?.dataset.panelId ?? store.getState().activePanel;

      sections.forEach((section) => {
        if ((section.offsetTop ?? 0) <= threshold) {
          nextActive = section.dataset.panelId ?? nextActive;
        }
      });

      if (nextActive !== store.getState().activePanel) {
        store.mutate(
          (state) => {
            state.activePanel = nextActive as OptionsSchemaPanelId;
          },
          { silent: true }
        );
        syncActiveLinks(target);
      }
    };

    const onScroll = (): void => {
      if (rafId) {
        return;
      }
      rafId = requestAnimationFrame(sync);
    };

    main.addEventListener('scroll', onScroll, { passive: true });
    sync();

    return () => {
      main.removeEventListener('scroll', onScroll);
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }

  function syncActiveLinks(target: HTMLElement): void {
    const state = store.getState();

    target.querySelectorAll<HTMLElement>('[data-nav-panel]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.navPanel === state.activePanel);
    });

    target.querySelectorAll<HTMLElement>('[data-footer-panel]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.footerPanel === state.activeResource);
    });
  }

  optionsUnsubscribe = dependencies.storage.sync.watchKey<StoredOptions>('options', () => {
    const fresh = dependencies.controller.readForm();
    store.mutate(
      (state) => {
        state.options = cloneOptions(fresh);
        state.transferLogMessage = buildTransferLogMessage(fresh, appData.messages);
        state.readingPathMode = resolveReadingPathMode(fresh);
      },
      { silent: true }
    );
    render();
  });

  render();

  return {
    cleanup() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      optionsUnsubscribe?.();
      optionsUnsubscribe = null;
      mainScrollCleanup?.();
      mainScrollCleanup = null;
      rendererInstance?.dispose();
      rendererInstance = null;
      clear(dependencies.container);
    },
    collectDraft() {
      syncMountedWidgetState();
      return cloneOptions(store.getState().options);
    },
    refreshOptions(options) {
      const fresh = options ? (options as CompleteOptions) : dependencies.controller.readForm();
      store.mutate(
        (state) => {
          state.options = cloneOptions(fresh);
          state.transferLogMessage = buildTransferLogMessage(fresh, appData.messages);
          state.readingPathMode = resolveReadingPathMode(fresh);
        },
        { silent: true }
      );
      render();
    },
    setMessages(messages, language) {
      appData = createSchemaShellAppData(messages);
      const nextSettingsSchemas = createSettingsSchemas(messages);
      settingsMap.clear();
      nextSettingsSchemas.forEach((schema) => {
        settingsMap.set(schema.id, schema);
      });
      resourceSchemas = createResourceSchemas(messages);
      resourceMap = new Map(resourceSchemas.map((schema) => [schema.id, schema]));
      store.mutate(
        (state) => {
          state.language = language;
          state.transferLogMessage = buildTransferLogMessage(state.options, messages);
        },
        { silent: true }
      );
      render();
    }
  };
}
