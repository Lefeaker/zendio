import { OptionsApp, type OptionsAppUIConfig } from '../components/layout/OptionsApp';
import { createOptionsStateManager } from '../state/StateManager';
import { getOptionsMessages } from './i18nContext';
import { getCurrentLanguage } from '../../i18n';
import type { FormSectionRegistry } from '../components/formSections/formSectionManager';
import {
  bindOptionsShellOptionsState,
  bindOptionsShellUsageState
} from './optionsShellBindings';
import {
  buildInitialShellState,
  getInitialShellUsageStats,
  resolveInitialShellSection
} from './optionsShellState';

export interface MountedOptionsShell {
  cleanup: () => void;
  stateManager: ReturnType<typeof createOptionsStateManager>;
  mountSection: (sectionId: string, options?: { activate?: boolean }) => Promise<void>;
  navigateTo: (sectionId: string) => Promise<void>;
  isSectionMounted: (sectionId: string) => boolean;
  preloadSections: (sectionIds: string[]) => Promise<void>;
  configureUI: (config: OptionsAppUIConfig) => void;
  initialSection: string;
  mountAllSections: () => Promise<void>;
  getMountedSection: (sectionId: string) => unknown | null;
}

export async function mountOptionsShell(
  formRegistry: FormSectionRegistry
): Promise<MountedOptionsShell> {
  if (typeof document === 'undefined') {
    throw new Error('[OptionsShell] document is unavailable during shell mount.');
  }

  const container = document.getElementById('optionsShellRoot');
  if (!container) {
    throw new Error('[OptionsShell] Required #optionsShellRoot container is missing.');
  }

  const messages = await getOptionsMessages();
  const language = await getCurrentLanguage();
  const usage = getInitialShellUsageStats();
  const stateManager = createOptionsStateManager(buildInitialShellState(language, usage));
  const initialSection = resolveInitialShellSection();

  const app = new OptionsApp(container);
  app.setMessages(messages);
  app.render({
    stateManager,
    initialSection,
    formRegistry
  });

  try {
    await app.mountSection(initialSection, true);
  } catch (error) {
    console.error('[OptionsShell] 首屏 Section 挂载失败:', error);
  }

  container.removeAttribute('hidden');
  container.classList.add('is-shell-mounted');
  document.body.classList.add('aobx-shell-active');

  const cleanupHandlers: Array<() => void> = [];
  cleanupHandlers.push(...(await bindOptionsShellOptionsState(stateManager)));
  cleanupHandlers.push(...(await bindOptionsShellUsageState(stateManager)));
  let disposed = false;

  const cleanup = (): void => {
    disposed = true;
    try {
      app.destroy();
    } catch (error) {
      console.error('[OptionsShell] 卸载 UI shell 时出错:', error);
    }

    cleanupHandlers.forEach((dispose) => {
      try {
        dispose();
      } catch (error) {
        console.error('[OptionsShell] 清理监听器时出错:', error);
      }
    });

    container.replaceChildren();
    container.setAttribute('hidden', 'hidden');
    container.classList.remove('is-shell-mounted');
    document.body.classList.remove('aobx-shell-active');
  };

  const collectSectionIds = (): string[] => {
    const ids: string[] = [];
    app.forEachSection((sectionId) => {
      ids.push(sectionId);
    });
    return ids;
  };

  const mountAllSections = async (): Promise<void> => {
    if (disposed) {
      return;
    }
    const sectionIds = collectSectionIds();
    for (const sectionId of sectionIds) {
      if (disposed) {
        return;
      }
      if (sectionId === initialSection && app.getMountedSection(sectionId)) {
        continue;
      }
      try {
        await app.mountSection(sectionId, false);
      } catch (error) {
        console.error('[OptionsShell] 挂载 Section 失败:', sectionId, error);
      }
    }
  };

  return {
    cleanup,
    stateManager,
    initialSection,
    mountAllSections,
    configureUI: (config: OptionsAppUIConfig) => {
      if (disposed) {
        return;
      }
      app.configureUI(config);
    },
    mountSection: async (sectionId: string, options?: { activate?: boolean }) => {
      if (disposed) {
        return;
      }
      await app.mountSection(sectionId, options?.activate ?? false);
    },
    navigateTo: async (sectionId: string) => {
      if (disposed) {
        return;
      }
      await app.navigateTo(sectionId);
    },
    isSectionMounted: (sectionId: string) => {
      if (disposed) {
        return false;
      }
      return app.getMountedSection(sectionId) !== null;
    },
    preloadSections: async (sectionIds: string[]) => {
      if (disposed) {
        return;
      }
      await app.preloadSections(sectionIds);
    },
    getMountedSection: (sectionId: string) => {
      if (disposed) {
        return null;
      }
      return app.getMountedSection(sectionId);
    }
  };
}
