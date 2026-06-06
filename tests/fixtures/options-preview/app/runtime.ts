import { clear, el } from '@options/stitch/ui/dom';
import { createActionRuntime } from '@options/schema-runtime/actionRuntime';
import { createSchemaRenderer } from '@options/schema-runtime/renderer';
import { previewUi } from '@options/stitch/ui/components';
import { previewContent } from '@options/stitch/content';
import { createStore, type PreviewStore } from '../state/store';
import {
  buildAppShell,
  buildPanelStack,
  buildScrollSection,
  buildSidebar
} from '@options/stitch/render/shellBuilders';
import {
  getFooterMeta,
  getFooterView,
  getResourceView,
  getSettingsView
} from '@options/stitch/schema/registry';
import { YamlConfigEditorWidgetAdapter } from '@options/yaml-config-editor/widgetAdapter';
import type { WidgetMountContract } from '@options/schema-runtime/contracts';
import type { PreviewStoreState, SchemaContext, ViewSchema } from '@options/stitch/types';
import { renderPreviewView } from '@options/stitch/render/renderStitchView';

interface PreviewRuntimeOptions {
  rootId: string;
  mode: 'main' | 'onboarding';
}

export function mountPreviewApp(options: PreviewRuntimeOptions): void {
  const root = document.getElementById(options.rootId);
  if (!root) {
    return;
  }
  const mountRoot = root;
  const widgetInstances = new Set<WidgetMountContract<Record<string, unknown>, unknown>>();

  const store = createStore(previewContent, () => render(mountRoot, store, options));
  let initialHashApplied = false;

  function getState(): PreviewStoreState {
    return store.getState();
  }

  function mutate(
    mutator: (state: PreviewStoreState) => void,
    mutationOptions: { silent?: boolean } = {}
  ): void {
    store.mutate(mutator, mutationOptions);
  }

  function createSchemaContext(): SchemaContext {
    return {
      appData: getLocalizedContent(),
      state: getState()
    };
  }

  const actionRuntime = createActionRuntime<PreviewStoreState, typeof previewContent>({
    getContext: createSchemaContext,
    mutate,
    handlers: {
      'preview:setTheme': ({ value, mutate: update }) => {
        const theme = value === 'light' ? 'light' : 'dark';
        update(
          (state) => {
            state.previewTheme = theme;
          },
          { silent: true }
        );
        syncDocumentTheme();
        applyThemeSelectionToDom(theme);
      },
      'preview:setLanguage': ({ value, mutate: update }) => {
        update(
          (state) => {
            state.previewLanguage = typeof value === 'string' && value.length > 0 ? value : 'zh-CN';
          },
          { silent: true }
        );
        rerenderSidebar();
        rerenderPanel('overview');
      },
      'navigation:scrollToPanel': ({ args }) => {
        scrollToPanel(String(args[0] ?? 'overview'));
      },
      'navigation:openMainAtPanel': ({ args }) => {
        window.location.href = `./index.html#${String(args[0] ?? 'overview')}`;
      },
      'navigation:closeResourceAndScrollToPanel': ({ args }) => {
        closeResource(false);
        requestAnimationFrame(() => {
          scrollToPanel(String(args[0] ?? 'overview'));
        });
      },
      'resource:close': () => {
        closeResource();
      },
      'resource:open': ({ args }) => {
        openResource(String(args[0] ?? ''));
      },
      'routing:add': ({ mutate: update }) => {
        update(
          (state) => {
            state.routingRules.push({
              type: 'Domain',
              pattern: '',
              target: previewContent.storage.vaults[0]?.name ?? 'AllInObsidian',
              priority: 50,
              enabled: true
            });
          },
          { silent: true }
        );
        rerenderPanel('storage');
      },
      'routing:remove': ({ args, mutate: update }) => {
        const index = Number(args[0] ?? -1);
        update(
          (state) => {
            state.routingRules.splice(index, 1);
          },
          { silent: true }
        );
        rerenderPanel('storage');
      },
      'routing:updateField': ({ args, value, mutate: update }) => {
        const index = Number(args[0] ?? -1);
        const field = String(args[1] ?? '');
        update(
          (state) => {
            const rule = state.routingRules[index];
            if (!rule) {
              return;
            }
            (rule as unknown as Record<string, unknown>)[field] = value;
          },
          { silent: true }
        );
      },
      'routing:updatePriority': ({ args, value, mutate: update }) => {
        const index = Number(args[0] ?? -1);
        update(
          (state) => {
            const rule = state.routingRules[index];
            if (!rule) {
              return;
            }
            rule.priority = typeof value === 'number' || value === '' ? value : rule.priority;
          },
          { silent: true }
        );
      },
      'template:setActiveField': ({ args, mutate: update }) => {
        update(
          (state) => {
            state.activeTemplateField = String(args[0] ?? 'articleVideo');
          },
          { silent: true }
        );
      },
      'template:updateValue': ({ args, value, mutate: update }) => {
        const field = String(args[0] ?? '');
        update(
          (state) => {
            state.templateValues[field] = String(value ?? '');
          },
          { silent: true }
        );
      },
      'template:insertToken': ({ value }) => {
        insertTemplateToken(String(value ?? ''));
      },
      'output:setReadingPathMode': ({ value, mutate: update }) => {
        update(
          (state) => {
            state.readingPathMode = String(value ?? 'custom');
          },
          { silent: true }
        );
        rerenderPanel('output');
      },
      'output:applyPreset': ({ args, mutate: update }) => {
        const preset = String(args[0] ?? '');
        update(
          (state) => {
            if (preset === 'Research') {
              state.templateValues.articleVideo = 'Research/{domain}/{yyyy}/{slug}.md';
              state.templateValues.readingCustom =
                'Research/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md';
              return;
            }
            if (preset === 'Conversation') {
              state.templateValues.aiChat = 'AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md';
              return;
            }
            if (preset === 'Minimal') {
              state.templateValues.articleVideo = 'Articles/{domain}/{yyyy}/{slug}.md';
            }
          },
          { silent: true }
        );
        rerenderPanel('output');
      },
      'yaml:setFilter': ({ args, value, mutate: update }) => {
        update(
          (state) => {
            state.yamlFilter = String(args[0] ?? value ?? 'all');
          },
          { silent: true }
        );
        rerenderPanel('output');
      },
      'yaml:toggleFieldState': ({ args, value, mutate: update }) => {
        const field = String(args[0] ?? '');
        const mode = String(args[1] ?? '');
        let next = 'Off';
        update(
          (state) => {
            const key = `${field}:${mode}`;
            const current = state.yamlFieldStates[key] ?? 'Off';
            next = current === 'Off' ? 'On' : 'Off';
            state.yamlFieldStates[key] = next;
          },
          { silent: true }
        );
        const target =
          value instanceof Event && value.currentTarget instanceof HTMLElement
            ? value.currentTarget
            : null;
        if (target) {
          target.textContent = next;
          target.classList.toggle('is-on', next === 'On');
        }
      },
      'highlight:setTheme': ({ args, value, mutate: update }) => {
        const theme = String(value ?? args[0] ?? 'gradient');
        update(
          (state) => {
            state.highlightTheme = theme;
          },
          { silent: true }
        );
        applyHighlightThemeToDom(theme);
      },
      'modifier:toggleKey': ({ args, value, mutate: update }) => {
        const key = String(value ?? args[0] ?? '');
        update(
          (state) => {
            if (!key) {
              return;
            }
            state.fragmentModifierEnabled = true;
            state.modifierKeys = state.modifierKeys.includes(key)
              ? state.modifierKeys.filter((item) => item !== key)
              : [...state.modifierKeys, key];
          },
          { silent: true }
        );
        rerenderPanel('capture-behavior');
      },
      'modifier:setEnabled': ({ value, mutate: update }) => {
        const enabled = Boolean(value);
        update(
          (state) => {
            state.fragmentModifierEnabled = enabled;
            if (!enabled) {
              state.modifierKeys = [];
            } else if (!state.modifierKeys.length) {
              state.modifierKeys = ['Alt'];
            }
          },
          { silent: true }
        );
        rerenderPanel('capture-behavior');
      },
      'experimental:updateAiConfigField': ({ args, value, mutate: update }) => {
        const field = String(args[0] ?? '');
        update(
          (state) => {
            (state.experimentalAiConfig as Record<string, string>)[field] = String(value ?? '');
          },
          { silent: true }
        );
      },
      'experimental:setPageSummaryEnabled': ({ mutate: update }) => {
        update(
          (state) => {
            state.pageSummaryEnabled = false;
          },
          { silent: true }
        );
      },
      'experimental:setReadingOverlaySummaryEnabled': ({ mutate: update }) => {
        update(
          (state) => {
            state.readingOverlaySummaryEnabled = false;
          },
          { silent: true }
        );
      },
      'experimental:setSubtitleTranslationEnabled': ({ mutate: update }) => {
        update(
          (state) => {
            state.subtitleTranslationEnabled = false;
          },
          { silent: true }
        );
      },
      'experimental:setSubtitleTargetLanguage': ({ mutate: update }) => {
        update(
          (state) => {
            state.subtitleTargetLanguage = state.subtitleTargetLanguage || 'zh-CN';
          },
          { silent: true }
        );
      }
    }
  });

  function dispatch(actionId: string, args: unknown[] = [], value?: unknown, event?: Event): void {
    actionRuntime.dispatch({ id: actionId, args }, value === undefined ? event : value);
  }

  function createRenderContext() {
    return {
      ...createSchemaContext(),
      el,
      ui: previewUi,
      dispatch,
      mountWidget
    };
  }

  function destroyWidgets(): void {
    widgetInstances.forEach((widget) => widget.destroy());
    widgetInstances.clear();
  }

  function mountWidget(widgetType: string, host: HTMLElement): void {
    const widget = widgetType === 'yaml-config' ? new YamlConfigEditorWidgetAdapter() : null;
    if (!widget) {
      host.textContent = `[Missing widget] ${widgetType}`;
      return;
    }
    widgetInstances.add(widget as WidgetMountContract<Record<string, unknown>, unknown>);
    widget.mount(host, { options: null, messages: null });
  }

  const schemaRenderer = createSchemaRenderer<PreviewStoreState, typeof previewContent>(
    {
      getContext: createSchemaContext,
      dispatch: (action, payload) => {
        if (typeof action === 'string') {
          dispatch(action, [], payload);
          return;
        }
        dispatch(action.id, action.args ?? [], payload);
      },
      mutate,
      requestRerender: () => render(mountRoot, store, options),
      getWidgetFactory: (widgetType) => {
        if (widgetType === 'yaml-config') {
          return () => new YamlConfigEditorWidgetAdapter() as never;
        }
        return null;
      }
    },
    {
      renderView: (view) => renderPreviewView(view as ViewSchema, createRenderContext())
    }
  );

  function render(
    target: HTMLElement,
    currentStore: PreviewStore,
    runtimeOptions: PreviewRuntimeOptions
  ): void {
    const previousMain = target.querySelector('.main');
    const previousScrollTop = previousMain instanceof HTMLElement ? previousMain.scrollTop : 0;
    syncDocumentTheme();

    destroyWidgets();
    clear(target).append(renderApp(runtimeOptions));

    const nextMain = target.querySelector('.main');
    if (nextMain instanceof HTMLElement && runtimeOptions.mode === 'main') {
      nextMain.scrollTop = previousScrollTop;
    }

    const chartHost = target.querySelector<HTMLElement>('[data-role="usage-chart-shell"]');
    if (chartHost) {
      previewUi.renderUsageChart(chartHost, previewContent.overview.history);
    }

    if (runtimeOptions.mode === 'main') {
      bindScrollSync(target);
      syncActiveLinks(target);
      restorePendingTemplateFocus(target);
      if (nextMain instanceof HTMLElement) {
        requestAnimationFrame(() => {
          nextMain.scrollTop = previousScrollTop;
        });
      }
      applyInitialHash();
    }
  }

  function renderApp(runtimeOptions: PreviewRuntimeOptions): HTMLElement {
    if (runtimeOptions.mode === 'onboarding') {
      return renderStandaloneOnboarding();
    }

    return buildAppShell({
      el,
      sidebar: renderSidebar(),
      panelStack: renderSectionStack()
    });
  }

  function renderStandaloneOnboarding(): HTMLElement {
    const view = getResourceView('onboarding', createSchemaContext());
    if (!view) {
      return el('div');
    }

    return el(
      'div',
      { className: 'standalone-page' },
      el('div', { className: 'standalone-shell' }, schemaRenderer.renderView(view as never))
    );
  }

  function renderSidebar(): HTMLElement {
    const state = getState();
    const appData = createSchemaContext().appData;

    return buildSidebar({
      el,
      brand: appData.brand,
      settingsTitle: '',
      resourcesTitle: getState().previewLanguage === 'en' ? 'Resources' : '资源',
      runtimeTitle: getState().previewLanguage === 'en' ? 'Runtime UI' : '运行时界面',
      navItems: appData.nav,
      sidebarLinks: appData.sidebarLinks,
      surfaceLinks: appData.surfaceLinks,
      activePanel: state.activePanel,
      activeResource: state.activeResource,
      onPanelClick: scrollToPanel,
      onFooterClick: openResource
    });
  }

  function renderSectionStack(): HTMLElement {
    return buildPanelStack({
      el,
      items: previewContent.nav,
      renderSection: (panelId) => {
        const view = getSettingsView(panelId, createSchemaContext());
        return renderScrollSection(panelId, view);
      }
    });
  }

  function renderScrollSection(panelId: string, view: ViewSchema | null): HTMLElement {
    const content = view ? schemaRenderer.renderView(view as never) : null;
    return buildScrollSection({
      el,
      panelId,
      content: content ?? el('div')
    });
  }

  function renderActiveResourceModal(): HTMLElement | null {
    const state = getState();
    if (!state.activeResource) {
      return null;
    }

    const view = getFooterView(state.activeResource, createSchemaContext());
    return view ? schemaRenderer.renderView(view as never) : null;
  }

  function renderActiveResourceModalIntoDom(): void {
    removeActiveResourceModalFromDom();
    const modal = renderActiveResourceModal();
    if (!modal) {
      return;
    }

    const host =
      mountRoot.querySelector<HTMLElement>('[data-modal-host="true"]') ??
      mountRoot.querySelector<HTMLElement>('.app');
    host?.append(modal);
  }

  function removeActiveResourceModalFromDom(): void {
    mountRoot.querySelectorAll('.resource-modal-overlay').forEach((modal) => modal.remove());
  }

  function rerenderSidebar(): void {
    const sidebar = mountRoot.querySelector<HTMLElement>('.sidebar');
    if (!sidebar) {
      return;
    }

    sidebar.replaceWith(renderSidebar());
    syncActiveLinks(mountRoot);
  }

  function rerenderPanel(panelId: string): void {
    const current = mountRoot.querySelector<HTMLElement>(`[data-panel-id="${panelId}"]`);
    const main = mountRoot.querySelector<HTMLElement>('.main');
    if (!current) {
      return;
    }

    const scrollTop = main?.scrollTop ?? 0;
    const view = getSettingsView(panelId, createSchemaContext());
    current.replaceWith(renderScrollSection(panelId, view));
    renderPanelDecorations(panelId);
    syncActiveLinks(mountRoot);

    if (main) {
      main.scrollTop = scrollTop;
      requestAnimationFrame(() => {
        main.scrollTop = scrollTop;
      });
    }
  }

  function renderPanelDecorations(panelId: string): void {
    if (panelId !== 'overview') {
      return;
    }

    const chartHost = mountRoot.querySelector<HTMLElement>('[data-role="usage-chart-shell"]');
    if (chartHost) {
      previewUi.renderUsageChart(chartHost, previewContent.overview.history);
    }
  }

  function openResource(resourceId: string): void {
    const meta = getFooterMeta(resourceId);
    if (!meta) {
      return;
    }

    if (meta.openMode === 'page') {
      window.open(meta.href ?? `./${resourceId}.html`, '_blank', 'noopener,noreferrer');
      return;
    }

    mutate(
      (state) => {
        state.activeResource = resourceId;
      },
      { silent: true }
    );
    renderActiveResourceModalIntoDom();
  }

  function closeResource(shouldRender: boolean = true): void {
    mutate(
      (state) => {
        state.activeResource = null;
      },
      { silent: true }
    );
    removeActiveResourceModalFromDom();
    if (shouldRender && options.mode !== 'main') {
      render(mountRoot, store, options);
    }
  }

  function scrollToPanel(panelId: string): void {
    const main = mountRoot.querySelector<HTMLElement>('.main');
    const section = mountRoot.querySelector<HTMLElement>(`[data-panel-id="${panelId}"]`);
    if (!main || !section) {
      return;
    }

    mutate(
      (state) => {
        state.activePanel = panelId;
      },
      { silent: true }
    );
    syncActiveLinks(mountRoot);
    main.scrollTo({
      top: Math.max(section.offsetTop - 12, 0),
      behavior: 'smooth'
    });
  }

  function bindScrollSync(target: HTMLElement): void {
    const main = target.querySelector<HTMLElement>('.main');
    const sections = Array.from(
      target.querySelectorAll<HTMLElement>('[data-scroll-section="true"]')
    );
    if (!main || sections.length === 0) {
      return;
    }

    let rafId = 0;
    const sync = () => {
      rafId = 0;
      const threshold = main.scrollTop + 120;
      let nextActive = sections[0]?.dataset.panelId ?? getState().activePanel;

      sections.forEach((section) => {
        if ((section.offsetTop ?? 0) <= threshold) {
          nextActive = section.dataset.panelId ?? nextActive;
        }
      });

      if (nextActive !== getState().activePanel) {
        mutate(
          (state) => {
            state.activePanel = nextActive;
          },
          { silent: true }
        );
        syncActiveLinks(target);
      }
    };

    main.addEventListener(
      'scroll',
      () => {
        if (rafId) {
          return;
        }
        rafId = requestAnimationFrame(sync);
      },
      { passive: true }
    );

    sync();
  }

  function syncActiveLinks(target: HTMLElement): void {
    const state = getState();

    target.querySelectorAll<HTMLElement>('[data-nav-panel]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.navPanel === state.activePanel);
    });

    target.querySelectorAll<HTMLElement>('[data-footer-panel]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.footerPanel === state.activeResource);
    });
  }

  function insertTemplateToken(token: string): void {
    const state = getState();
    const field = state.activeTemplateField;
    if (!field) {
      return;
    }

    const input = mountRoot.querySelector<HTMLInputElement>(`[data-template-field="${field}"]`);
    const currentValue = input ? input.value : (state.templateValues[field] ?? '');
    const hasFocus = input ? document.activeElement === input : false;
    const start =
      hasFocus && input ? (input.selectionStart ?? currentValue.length) : currentValue.length;
    const end =
      hasFocus && input ? (input.selectionEnd ?? currentValue.length) : currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`;
    const nextCursor = start + token.length;

    mutate(
      (draft) => {
        draft.templateValues[field] = nextValue;
      },
      { silent: true }
    );

    if (input) {
      input.value = nextValue;
      input.focus({ preventScroll: true });
      input.setSelectionRange(nextCursor, nextCursor);
    }
  }

  function restorePendingTemplateFocus(target: HTMLElement): void {
    const state = getState();
    if (!state.pendingTemplateFocus) {
      return;
    }

    const input = target.querySelector<HTMLInputElement>(
      `[data-template-field="${state.pendingTemplateFocus}"]`
    );
    if (input) {
      input.focus({ preventScroll: true });
      if (state.pendingTemplateSelection) {
        input.setSelectionRange(
          state.pendingTemplateSelection.start,
          state.pendingTemplateSelection.end
        );
      }
    }

    mutate(
      (draft) => {
        draft.pendingTemplateFocus = null;
        draft.pendingTemplateSelection = null;
      },
      { silent: true }
    );
  }

  function applyInitialHash(): void {
    if (initialHashApplied || options.mode !== 'main') {
      return;
    }

    initialHashApplied = true;
    const target = window.location.hash.replace(/^#/, '');
    if (!target) {
      return;
    }

    requestAnimationFrame(() => {
      scrollToPanel(target);
    });
  }

  function syncDocumentTheme(): void {
    const theme = getState().previewTheme;
    document.documentElement.dataset.previewTheme = theme;
    document.body.dataset.previewTheme = theme;
  }

  function applyThemeSelectionToDom(theme: PreviewStoreState['previewTheme']): void {
    const section = mountRoot.querySelector<HTMLElement>('.interface-theme-grid');
    if (!section) {
      return;
    }

    section.querySelectorAll<HTMLElement>('.chip[data-value]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.value === theme ? 'true' : 'false');
    });

    section.querySelectorAll<HTMLElement>('.chips').forEach((chips) => {
      chips.dataset.activeValue = theme;
    });
  }

  function applyHighlightThemeToDom(theme: string): void {
    const section = mountRoot.querySelector<HTMLElement>('[data-panel-id="capture-behavior"]');
    if (!section) {
      return;
    }

    const labels = ['Gradient', 'Purple', 'Neon Yellow', 'Neon Green', 'Neon Orange'];
    const activeLabel =
      (
        {
          gradient: 'Gradient',
          purple: 'Purple',
          neonYellow: 'Neon Yellow',
          neonGreen: 'Neon Green',
          neonOrange: 'Neon Orange'
        } as Record<string, string>
      )[theme] ?? 'Gradient';

    section.querySelectorAll<HTMLElement>('.chip').forEach((button) => {
      if (!labels.includes(button.textContent?.trim() ?? '')) {
        return;
      }
      button.setAttribute(
        'aria-pressed',
        button.textContent?.trim() === activeLabel ? 'true' : 'false'
      );
    });

    const inline = section.querySelector<HTMLElement>('.inline-highlight');
    if (!inline) {
      return;
    }

    inline.classList.remove(
      'highlight-gradient',
      'highlight-purple',
      'highlight-neon-yellow',
      'highlight-neon-green',
      'highlight-neon-orange'
    );
    inline.classList.add(
      (
        {
          gradient: 'highlight-gradient',
          purple: 'highlight-purple',
          neonYellow: 'highlight-neon-yellow',
          neonGreen: 'highlight-neon-green',
          neonOrange: 'highlight-neon-orange'
        } as Record<string, string>
      )[theme] ?? 'highlight-gradient'
    );
  }

  function getLocalizedContent() {
    const language = getState().previewLanguage;
    const useChinese = language !== 'en';

    return {
      ...previewContent,
      brand: {
        ...previewContent.brand,
        subtitle: useChinese ? '组件预览' : 'Component Preview'
      },
      nav: previewContent.nav.map((item) => ({
        ...item,
        label: useChinese ? localizeNavLabel(item.id) : item.label,
        hint: useChinese ? localizeNavHint(item.id) : item.hint
      })),
      sidebarLinks: previewContent.sidebarLinks.map((item) => ({
        ...item,
        label: useChinese ? localizeResourceLabel(item.id) : item.label,
        hint: useChinese ? localizeResourceHint(item.id) : item.hint
      })),
      surfaceLinks: previewContent.surfaceLinks.map((item) => ({
        ...item,
        label: useChinese ? localizeSurfaceLabel(item.id) : item.label,
        hint: useChinese ? localizeSurfaceHint(item.id) : item.hint
      })),
      overview: {
        ...previewContent.overview,
        hero: {
          ...previewContent.overview.hero,
          title: useChinese ? '总览' : previewContent.overview.hero.title
        }
      },
      storage: {
        ...previewContent.storage,
        hero: {
          ...previewContent.storage.hero,
          title: useChinese ? '仓库' : previewContent.storage.hero.title
        }
      },
      captureSources: {
        ...previewContent.captureSources,
        hero: {
          ...previewContent.captureSources.hero,
          title: useChinese ? '采集来源' : previewContent.captureSources.hero.title
        }
      },
      captureBehavior: {
        ...previewContent.captureBehavior,
        hero: {
          ...previewContent.captureBehavior.hero,
          title: useChinese ? '采集行为' : previewContent.captureBehavior.hero.title
        }
      },
      output: {
        ...previewContent.output,
        hero: {
          ...previewContent.output.hero,
          title: useChinese ? '输出与元数据' : previewContent.output.hero.title
        }
      },
      experimental: {
        ...previewContent.experimental,
        hero: {
          ...previewContent.experimental.hero,
          title: useChinese ? '实验功能' : previewContent.experimental.hero.title
        }
      },
      resources: {
        ...previewContent.resources,
        onboarding: {
          ...previewContent.resources.onboarding,
          hero: {
            ...previewContent.resources.onboarding.hero,
            title: useChinese ? '首次引导' : previewContent.resources.onboarding.hero.title
          }
        }
      }
    };
  }

  function localizeNavLabel(id: string): string {
    return (
      (
        {
          overview: '总览',
          storage: '仓库',
          'capture-sources': '采集来源',
          'capture-behavior': '采集行为',
          output: '输出与元数据',
          experimental: '实验功能',
          maintenance: '维护'
        } as Record<string, string>
      )[id] ?? id
    );
  }

  function localizeNavHint(id: string): string {
    return (
      (
        {
          overview: '使用概览、语言、隐私与数据控制',
          storage: '仓库列表、连接参数、路由',
          'capture-sources': 'AI、Deep Research、Video',
          'capture-behavior': 'Reading、Fragment 行为与导出',
          // Zendio 0.2.0: presets are hidden because they overwrite config without an approved user flow.
          output: '路径模板、映射、YAML',
          experimental: 'AI 总结、字幕翻译',
          maintenance: 'Transfer、Diagnosis、修复'
        } as Record<string, string>
      )[id] ?? ''
    );
  }

  function localizeResourceLabel(id: string): string {
    return (
      (
        {
          onboarding: '首次引导',
          'plugin-setup': '插件设置',
          support: '支持',
          suggestions: '建议',
          contact: '联系',
          changelog: '更新日志'
        } as Record<string, string>
      )[id] ?? id
    );
  }

  function localizeResourceHint(id: string): string {
    return (
      (
        {
          onboarding: '首次引导与快速了解',
          'plugin-setup': 'Local REST API 配置指南',
          support: '支持作者与服务范围',
          suggestions: '建议与反馈渠道',
          contact: '联系作者与支持邮箱',
          changelog: '最近版本更新'
        } as Record<string, string>
      )[id] ?? ''
    );
  }

  function localizeSurfaceLabel(id: string): string {
    return (
      (
        {
          clipper: '剪藏弹窗',
          reader: '阅读模式',
          video: '视频模式',
          'video-floating-prompt': '视频启动提示',
          'task-success': '任务完成'
        } as Record<string, string>
      )[id] ?? id
    );
  }

  function localizeSurfaceHint(id: string): string {
    return (
      (
        {
          clipper: '网页选中文本后的剪藏浮窗',
          reader: '阅读模式悬浮面板',
          video: '视频模式记录面板',
          'video-floating-prompt': '视频页面的启动提示浮层',
          'task-success': '任务完成后的成功提示与反馈弹窗'
        } as Record<string, string>
      )[id] ?? ''
    );
  }

  render(mountRoot, store, options);
}
