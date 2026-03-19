import { createDefaultPageI18nController, type PageI18nController, type Language, configureI18nStorage } from '../../i18n';
import { showTransferMessage, clearTransferMessage, showStatusMessage, formatOptionsError } from '../components/messages';
import { runDiagnostics, fixConfiguration } from '../components/diagnostics';
import {
  copyOptionsToClipboard,
  parseConfigInput,
  readConfigTextFromClipboard,
  type ConfigTransferPayload
} from '../services/configTransfer';
import { consumeYamlMigrationNotice } from '../state/optionsStore';
import type { StoredOptions } from '../../shared/types/options';
import { normalizeOptionsForTransfer } from '../utils/optionsTransfer';
import { chromeOptionsPersistence } from '../services/persistence';
import { createOptionsFormAdapter } from '../components/optionsFormAdapter';
import { createOptionsController } from './optionsController';
import type { OptionsController } from './optionsController';
import { registerOptionsController, consumePendingAutoSaveSource } from './optionsControllerContext';
import { setOptionsI18nContext, getOptionsMessages } from './i18nContext';
import {
  exportAnalyticsTransferPayload,
  applyAnalyticsTransferPayload
} from '../services/analyticsTransfer';
import { ModalController, type ModalBindingConfig } from '../components/infrastructure/ModalController';
import { NavigationController } from '../components/layout/NavigationController';
import { mountExperimentalShell, type MountedOptionsShell } from './experimentalShell';
import { configureOptionsActions } from './optionsActions';
import {
  enforceAiTimestampsDisabled,
  syncClassifierNote,
  highlightFragmentShortcuts,
  refreshPrivacySettings,
  savePrivacySettings
} from '../components/sectionRegistry';
import { FormSectionRegistry } from '../components/formSections/formSectionManager';
import { ThemeSwitcher } from '../components/shared/ThemeSwitcher';
import { configureAnalyticsConfigManager } from '../../shared/errors/analytics/analyticsConfig';
import { configureGlobalStateManagerStorage } from '../../shared/state/globalStateManager';
import type { StorageService } from '../../platform/interfaces/storage';

let formSectionRegistry: FormSectionRegistry | null = null;
let optionsController: OptionsController | null = null;
let themeSwitcher: ThemeSwitcher | null = null;

function initializeThemeSwitcher(): void {
  const container = document.getElementById('theme-switcher');
  if (!container) {
    console.warn('[Options] Theme switcher container not found');
    return;
  }

  if (themeSwitcher) {
    themeSwitcher.destroy();
    themeSwitcher = null;
  }

  themeSwitcher = new ThemeSwitcher(container);
  themeSwitcher.init();

  registerCleanup(() => {
    if (themeSwitcher) {
      themeSwitcher.destroy();
      themeSwitcher = null;
    }
  });
}

function initializeOptionsRuntime(): void {
  if (optionsController) {
    optionsController.dispose();
    optionsController = null;
  }
  if (formSectionRegistry) {
    formSectionRegistry.clear();
    formSectionRegistry = null;
  }

  const registry = new FormSectionRegistry();
  formSectionRegistry = registry;

  const formAdapter = createOptionsFormAdapter(registry);
  const controller = createOptionsController({
    persistence: chromeOptionsPersistence,
    formAdapter,
    formRegistry: registry,
    autoSaveDebounceMs: 400,
    onSaveError: (reason, error) => {
      if (reason === 'auto') {
        console.error('[options] Auto-save failed:', error);
      }
    },
    onSaveSuccess: (reason) => {
      if (reason !== 'auto') {
        return;
      }
      const source = consumePendingAutoSaveSource();
      if (!source) {
        return;
      }
      void showAutoSaveNotice(source);
    }
  });

  optionsController = controller;
  registerOptionsController(controller);

  registerCleanup(() => {
    if (optionsController === controller) {
      optionsController = null;
    }
    controller.dispose();
  });

  registerCleanup(() => {
    if (formSectionRegistry === registry) {
      formSectionRegistry = null;
    }
    registry.clear();
  });
}

function requireOptionsController(): OptionsController {
  if (!optionsController) {
    throw new Error('[Options] OptionsController is not initialized.');
  }
  return optionsController;
}

type CleanupFn = () => void;
const cleanupHandlers: CleanupFn[] = [];
let declarativeI18nController: PageI18nController | null = null;
let unloadCleanupRegistered = false;
let mountedShell: MountedOptionsShell | null = null;
const PRELOAD_SECTION_IDS = ['rest', 'routing', 'templates', 'yaml'];
async function ensureDeclarativeI18nController(): Promise<PageI18nController> {
  if (!declarativeI18nController) {
    const controller = createDefaultPageI18nController();
    await controller.load();

    if (typeof document !== 'undefined') {
      controller.mount(document);
    }

    declarativeI18nController = controller;
    setOptionsI18nContext(controller.getBinder(), controller.getCurrentResource());
  }

  return declarativeI18nController;
}

async function applyI18n(): Promise<void> {
  const controller = await ensureDeclarativeI18nController();
  setOptionsI18nContext(controller.getBinder(), controller.getCurrentResource());
}

export interface OptionsAppBootstrapDependencies {
  storage: StorageService;
}

let optionsAppBootstrapStorage: StorageService | null = null;

export function configureOptionsAppBootstrapStorage(storage: StorageService): void {
  optionsAppBootstrapStorage = storage;
}

function resolveOptionsAppBootstrapDependencies(
  dependencies?: Partial<OptionsAppBootstrapDependencies>
): OptionsAppBootstrapDependencies {
  if (dependencies?.storage) {
    optionsAppBootstrapStorage = dependencies.storage;
    return { storage: dependencies.storage };
  }

  if (!optionsAppBootstrapStorage) {
    throw new Error('[Options] StorageService is required for bootstrap.');
  }

  return {
    storage: optionsAppBootstrapStorage
  };
}

export async function bootstrapOptionsApp(
  dependencies?: Partial<OptionsAppBootstrapDependencies>
): Promise<void> {
  // 二次启动时先释放上一轮注册的 shell 与清理回调，防止热刷新残留状态。
  teardownMountedShell();
  disposeCleanupHandlers();
  ensureUnloadCleanup();
  const { storage } = resolveOptionsAppBootstrapDependencies(dependencies);
  configureAnalyticsConfigManager(storage);
  configureGlobalStateManagerStorage(storage);
  configureI18nStorage(storage.sync);
  await applyI18n();

  // ✅ Phase 3: 初始化主题切换器
  initializeThemeSwitcher();

  initializeOptionsRuntime();

  const registry = formSectionRegistry;
  if (!registry) {
    throw new Error('[Options] Failed to initialize FormSectionRegistry.');
  }

  const shell = await mountExperimentalShell(registry);
  mountedShell = shell;
  registerCleanup(() => {
    teardownMountedShell();
  });
  const modalBindings = createModalBindings();
  if (shell) {
    void shell.preloadSections(PRELOAD_SECTION_IDS).catch((error) => {
      console.warn('[Options] Section preload failed:', error);
    });

    configureOptionsActions({
      stateManager: shell.stateManager,
      changeLanguage: handleLanguageChange,
      copyConfig: () => handleCopyConfig(),
      importConfig: () => handleImportConfig(),
      saveOptions: () => handleSave(),
      runDiagnostics: () => runDiagnostics(),
      fixConfiguration: () => handleFix(),
      reloadDiagnostics: () => handleReload()
    });

    await refreshUIFromStorage();
    await ensureInitialSectionVisible(shell);
    await ensureAllSectionsMounted(shell);
    shell.configureUI({ modalBindings });
  } else {
    const modalController = new ModalController({ bindings: modalBindings });
    const navigationController = new NavigationController();
    registerCleanup(() => {
      modalController.dispose();
      navigationController.dispose();
    });

    configureOptionsActions({
      stateManager: null,
      changeLanguage: handleLanguageChange,
      copyConfig: () => handleCopyConfig(),
      importConfig: () => handleImportConfig(),
      saveOptions: () => handleSave(),
      runDiagnostics: () => runDiagnostics(),
      fixConfiguration: () => handleFix(),
      reloadDiagnostics: () => handleReload()
    });

    await refreshUIFromStorage();
  }

  // 处理 URL hash 锚点
  handleUrlHash();
}

async function ensureInitialSectionVisible(shell: MountedOptionsShell): Promise<void> {
  const initialSection = shell.initialSection;
  await shell.mountSection(initialSection, { activate: true });
  const currentState = shell.stateManager.getState();
  if (currentState.activeSection !== initialSection) {
    await shell.navigateTo(initialSection);
  }
}

async function ensureAllSectionsMounted(shell: MountedOptionsShell): Promise<void> {
  await shell.mountAllSections();
}

async function refreshUIFromStorage(): Promise<void> {
  const controller = requireOptionsController();
  const stored = await controller.loadInitialState();
  await applyOptionsSnapshot(stored);
}

async function handleLanguageChange(language: Language): Promise<Language> {
  const controller = await ensureDeclarativeI18nController();
  await controller.changeLanguage(language);
  setOptionsI18nContext(controller.getBinder(), controller.getCurrentResource());
  await refreshUIFromStorage();
  await refreshPrivacySettings();
  const resource = controller.getCurrentResource();
  return (resource?.language ?? language) as Language;
}

async function applyOptionsSnapshot(options: StoredOptions): Promise<void> {
  const controller = requireOptionsController();
  await controller.applyToForm(options);
  enforceAiTimestampsDisabled();
  syncClassifierNote();
  clearTransferMessage();

  const migrationNotice = consumeYamlMigrationNotice();
  if (migrationNotice) {
    const msgs = await getOptionsMessages();
    const text = msgs.yamlConfigMigrated ?? 'YAML field configuration has been migrated to the latest format.';
    showStatusMessage('success', { key: migrationNotice, text });
  }
}

export async function showAutoSaveNotice(source: string): Promise<void> {
  const msgs = await getOptionsMessages();
  if (source === 'yamlConfig') {
    const text = msgs.yamlConfigAutoSaved ?? 'YAML field configuration changes saved.';
    showStatusMessage('success', { key: 'yamlConfigAutoSaved', text });
    return;
  }

  if (source === 'templates') {
    const text = msgs.templatesAutoSaved ?? 'Template settings saved automatically.';
    showStatusMessage('success', { key: 'templatesAutoSaved', text });
  }
}

function createModalBindings(): ModalBindingConfig[] {
  let suggestionsQrCleanup: CleanupFn | null = null;

  const hideSuggestionsQr = (): void => {
    const modal = document.getElementById('suggestionsModal');
    const qrContainer = modal?.querySelector<HTMLElement>('#suggestionsXhsQr');
    if (qrContainer) {
      qrContainer.setAttribute('hidden', 'hidden');
    }
  };

  const prepareSuggestionsModal = (): void => {
    const modal = document.getElementById('suggestionsModal');
    if (!modal) {
      return;
    }

    hideSuggestionsQr();

    const qrTrigger = modal.querySelector<HTMLButtonElement>('#suggestionsXhsTrigger');
    const qrContainer = modal.querySelector<HTMLElement>('#suggestionsXhsQr');
    if (qrTrigger && qrContainer) {
      if (suggestionsQrCleanup) {
        suggestionsQrCleanup();
        suggestionsQrCleanup = null;
      }

      const toggleQr = (event: Event): void => {
        event.preventDefault();
        if (qrContainer.hasAttribute('hidden')) {
          qrContainer.removeAttribute('hidden');
        } else {
          qrContainer.setAttribute('hidden', 'hidden');
        }
      };

      qrTrigger.addEventListener('click', toggleQr);
      suggestionsQrCleanup = () => {
        qrTrigger.removeEventListener('click', toggleQr);
      };
    }
  };

  return [
    { triggerId: 'supportLink', modalId: 'supportModal' },
    {
      triggerId: 'suggestionsLink',
      modalId: 'suggestionsModal',
      onOpen: prepareSuggestionsModal,
      onClose: () => {
        if (suggestionsQrCleanup) {
          suggestionsQrCleanup();
          suggestionsQrCleanup = null;
        }
        hideSuggestionsQr();
      }
    },
    { triggerId: 'contactLink', modalId: 'contactModal' },
    { triggerId: 'versionLink', modalId: 'changelogModal', onOpen: prepareChangelogModal }
  ];
}

function registerCleanup(handler: CleanupFn | null | undefined): void {
  if (typeof handler === 'function') {
    cleanupHandlers.push(handler);
  }
}

function ensureUnloadCleanup(): void {
  if (unloadCleanupRegistered) {
    return;
  }

  const disposeOnUnload = (): void => {
    disposeCleanupHandlers();
  };

  window.addEventListener('beforeunload', disposeOnUnload);
  cleanupHandlers.push(() => {
    window.removeEventListener('beforeunload', disposeOnUnload);
  });

  unloadCleanupRegistered = true;
}

function disposeCleanupHandlers(): void {
  while (cleanupHandlers.length > 0) {
    const handler = cleanupHandlers.pop();
    try {
      handler?.();
    } catch (error) {
      console.error('[Options] 清理增强功能时出错:', error);
    }
  }
  unloadCleanupRegistered = false;
}

function teardownMountedShell(): void {
  if (!mountedShell) {
    return;
  }
  const currentShell = mountedShell;
  mountedShell = null;
  try {
    currentShell.cleanup();
  } catch (error) {
    console.error('[Options] 卸载 shell 时出错:', error);
  }
}

async function handleCopyConfig(): Promise<void> {
  clearTransferMessage();
  const msgs = await getOptionsMessages();

  try {
    const controller = requireOptionsController();
    const options = controller.readForm();
    const payload = normalizeOptionsForTransfer(options);
    const analyticsPayload = await exportAnalyticsTransferPayload();
    const transferPayload: ConfigTransferPayload = {
      version: 1,
      options: payload
    };
    if (analyticsPayload) {
      transferPayload.analytics = analyticsPayload;
    }
    await copyOptionsToClipboard(transferPayload);
    showTransferMessage('success', { key: 'copyConfigSuccess', text: msgs.copyConfigSuccess });
  } catch (error) {
    showTransferMessage('error', formatOptionsError(error, msgs));
  }
}

async function handleImportConfig(): Promise<void> {
  clearTransferMessage();
  const msgs = await getOptionsMessages();

  try {
    const controller = requireOptionsController();
    const raw = await readConfigTextFromClipboard();
    const parsed = parseConfigInput(raw);
    const normalized = normalizeOptionsForTransfer(parsed.options);
    await applyOptionsSnapshot(normalized);
    await controller.saveSnapshot({ reason: 'import', draft: normalized });
    await applyAnalyticsTransferPayload(parsed.analytics);
    await refreshPrivacySettings();

    showTransferMessage('success', { key: 'importSuccess', text: msgs.importSuccess });
    showStatusMessage('success', { key: 'importSuccess', text: msgs.importSuccess });
  } catch (error) {
    showTransferMessage('error', formatOptionsError(error, msgs));
  }
}

async function handleSave(): Promise<void> {
  const msgs = await getOptionsMessages();

  try {
    const controller = requireOptionsController();
    await controller.saveSnapshot({ reason: 'manual' });
    await savePrivacySettings({ showInlineStatus: false });
    showStatusMessage('success', { key: 'saveSuccess', text: msgs.saveSuccess });
  } catch (error) {
    showStatusMessage('error', `${msgs.saveFailed}: ${formatOptionsError(error, msgs)}`);
  }
}

async function handleFix(): Promise<void> {
  await fixConfiguration(refreshUIFromStorage);
}

async function handleReload(): Promise<void> {
  await refreshUIFromStorage();
  await runDiagnostics();
}

/**
 * 处理 URL hash 锚点，滚动到对应元素并高亮显示
 */
function handleUrlHash(): void {
  const hash = window.location.hash.substring(1); // 移除 # 号
  if (!hash) {
    return;
  }

  const schedule = (): void => {
    if (hash.startsWith('section-')) {
      const sectionId = hash.slice('section-'.length);
      void mountedShell?.navigateTo(sectionId);
      return;
    }
    if (hash === 'shortcuts') {
      void (async () => {
        await mountedShell?.mountSection('fragment', { activate: true });
        const highlighted = highlightFragmentShortcuts();
        if (!highlighted) {
          console.warn('[Options] Target element for hash "shortcuts" not found via registry');
        }
      })();
    }
  };

  // 延迟执行，确保页面完全渲染
  window.setTimeout(schedule, 200);
}

async function prepareChangelogModal(): Promise<void> {
  await loadChangelogContent();
}

async function loadChangelogContent(): Promise<void> {
  const changelogContent = document.getElementById('changelogContent');
  if (!changelogContent) return;

  // 获取当前语言
  const controller = await ensureDeclarativeI18nController();
  const resource = controller.getCurrentResource();
  const currentLang = resource?.language || 'zh-CN';

  // 根据语言生成更新日志内容
  const changelog = getChangelogByLanguage(currentLang);
  changelogContent.innerHTML = changelog;
}

function getChangelogByLanguage(language: string): string {
  const changelogs: Record<string, string> = {
    'zh-CN': `
      <h2>v0.2.0 - 2025-09-30</h2>
      <h3>✨ 新增功能</h3>
      <ul>
        <li><strong>双 URL 配置</strong>: 现在可以分别配置 HTTPS 和 HTTP 两个 URL
          <ul>
            <li>在选项页面添加了 <code>HTTPS URL</code> 和 <code>HTTP URL</code> 两个独立字段</li>
            <li>扩展会智能选择可用的连接方式</li>
            <li>向后兼容旧的 <code>baseUrl</code> 配置</li>
          </ul>
        </li>
      </ul>

      <h3>🔧 改进</h3>
      <ul>
        <li><strong>智能容错机制增强</strong>
          <ul>
            <li>优先使用用户配置的 HTTPS 和 HTTP URL</li>
            <li>自动在多个协议和端口之间切换</li>
            <li>详细的日志输出，方便调试</li>
          </ul>
        </li>
      </ul>

      <h3>📝 配置说明</h3>
      <p><strong>新的配置方式</strong>（推荐）:</p>
      <pre><code>HTTPS URL: https://127.0.0.1:27124/
HTTP URL:  http://127.0.0.1:27123/
Vault:     your-vault-name
API Key:   your-api-key</code></pre>

      <p><strong>旧的配置方式</strong>（仍然支持）:</p>
      <pre><code>Base URL:  https://127.0.0.1:27124/
Vault:     your-vault-name
API Key:   your-api-key</code></pre>

      <h3>🎯 使用建议</h3>
      <ul>
        <li>配置两个 URL（HTTPS 和 HTTP），让扩展自动选择可用的连接</li>
        <li>如果不确定端口，可以在 Obsidian 的 Local REST API 插件设置中查看</li>
        <li>通常 HTTPS 端口为 27124，HTTP 端口为 27123</li>
      </ul>

      <h3>📚 技术细节</h3>
      <ul>
        <li>修改了 <code>src/background/store.ts</code> 添加 <code>httpsUrl</code> 和 <code>httpUrl</code> 字段</li>
        <li>更新了 <code>src/options/index.html</code> 和 <code>src/options/index.ts</code> 配置页面</li>
        <li>增强了 <code>src/background/sinks/obsidianRest.ts</code> 的容错逻辑</li>
        <li>改进了 <code>src/background/index.ts</code> 的连接测试功能</li>
      </ul>

      <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);">

      <h2>v0.1.0 - 2025-09-26</h2>
      <h3>🎉 初始版本</h3>
      <ul>
        <li>基本的网页剪藏功能</li>
        <li>Obsidian Local REST API 集成</li>
        <li>模板系统</li>
        <li>AI 分类器支持</li>
        <li>多平台 AI 聊天记录导出（ChatGPT、Claude、Gemini 等）</li>
        <li>域名映射配置</li>
        <li>多语言支持（中文、英文、日文）</li>
      </ul>
    `,
    'en': `
      <h2>v0.2.0 - 2025-09-30</h2>
      <h3>✨ New Features</h3>
      <ul>
        <li><strong>Dual URL Configuration</strong>: Now you can configure HTTPS and HTTP URLs separately
          <ul>
            <li>Added separate <code>HTTPS URL</code> and <code>HTTP URL</code> fields in options page</li>
            <li>Extension intelligently chooses available connection method</li>
            <li>Backward compatible with old <code>baseUrl</code> configuration</li>
          </ul>
        </li>
      </ul>

      <h3>🔧 Improvements</h3>
      <ul>
        <li><strong>Enhanced Smart Fallback Mechanism</strong>
          <ul>
            <li>Prioritize user-configured HTTPS and HTTP URLs</li>
            <li>Automatically switch between multiple protocols and ports</li>
            <li>Detailed logging output for easier debugging</li>
          </ul>
        </li>
      </ul>

      <h3>📝 Configuration Guide</h3>
      <p><strong>New Configuration Method</strong> (Recommended):</p>
      <pre><code>HTTPS URL: https://127.0.0.1:27124/
HTTP URL:  http://127.0.0.1:27123/
Vault:     your-vault-name
API Key:   your-api-key</code></pre>

      <p><strong>Old Configuration Method</strong> (Still Supported):</p>
      <pre><code>Base URL:  https://127.0.0.1:27124/
Vault:     your-vault-name
API Key:   your-api-key</code></pre>

      <h3>🎯 Usage Recommendations</h3>
      <ul>
        <li>Configure both URLs (HTTPS and HTTP) to let the extension automatically choose available connection</li>
        <li>If unsure about ports, check in Obsidian's Local REST API plugin settings</li>
        <li>Usually HTTPS port is 27124, HTTP port is 27123</li>
      </ul>

      <h3>📚 Technical Details</h3>
      <ul>
        <li>Modified <code>src/background/store.ts</code> to add <code>httpsUrl</code> and <code>httpUrl</code> fields</li>
        <li>Updated <code>src/options/index.html</code> and <code>src/options/index.ts</code> configuration pages</li>
        <li>Enhanced fallback logic in <code>src/background/sinks/obsidianRest.ts</code></li>
        <li>Improved connection testing functionality in <code>src/background/index.ts</code></li>
      </ul>

      <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);">

      <h2>v0.1.0 - 2025-09-26</h2>
      <h3>🎉 Initial Release</h3>
      <ul>
        <li>Basic web clipping functionality</li>
        <li>Obsidian Local REST API integration</li>
        <li>Template system</li>
        <li>AI classifier support</li>
        <li>Multi-platform AI chat export (ChatGPT, Claude, Gemini, etc.)</li>
        <li>Domain mapping configuration</li>
        <li>Multi-language support (Chinese, English, Japanese)</li>
      </ul>
    `,
    'ja': `
      <h2>v0.2.0 - 2025-09-30</h2>
      <h3>✨ 新機能</h3>
      <ul>
        <li><strong>デュアルURL設定</strong>: HTTPSとHTTPのURLを個別に設定可能
          <ul>
            <li>オプションページに<code>HTTPS URL</code>と<code>HTTP URL</code>の独立したフィールドを追加</li>
            <li>拡張機能が利用可能な接続方法を自動選択</li>
            <li>従来の<code>baseUrl</code>設定との後方互換性</li>
          </ul>
        </li>
      </ul>

      <h3>🔧 改善</h3>
      <ul>
        <li><strong>スマートフォールバック機能の強化</strong>
          <ul>
            <li>ユーザー設定のHTTPSおよびHTTP URLを優先</li>
            <li>複数のプロトコルとポート間で自動切り替え</li>
            <li>デバッグしやすい詳細なログ出力</li>
          </ul>
        </li>
      </ul>

      <h3>📝 設定ガイド</h3>
      <p><strong>新しい設定方法</strong>（推奨）:</p>
      <pre><code>HTTPS URL: https://127.0.0.1:27124/
HTTP URL:  http://127.0.0.1:27123/
Vault:     your-vault-name
API Key:   your-api-key</code></pre>

      <p><strong>従来の設定方法</strong>（引き続きサポート）:</p>
      <pre><code>Base URL:  https://127.0.0.1:27124/
Vault:     your-vault-name
API Key:   your-api-key</code></pre>

      <h3>🎯 使用推奨事項</h3>
      <ul>
        <li>両方のURL（HTTPSとHTTP）を設定して、拡張機能が利用可能な接続を自動選択できるようにする</li>
        <li>ポートが不明な場合は、ObsidianのLocal REST APIプラグイン設定で確認</li>
        <li>通常、HTTPSポートは27124、HTTPポートは27123</li>
      </ul>

      <h3>📚 技術詳細</h3>
      <ul>
        <li><code>src/background/store.ts</code>を修正して<code>httpsUrl</code>と<code>httpUrl</code>フィールドを追加</li>
        <li><code>src/options/index.html</code>と<code>src/options/index.ts</code>設定ページを更新</li>
        <li><code>src/background/sinks/obsidianRest.ts</code>のフォールバックロジックを強化</li>
        <li><code>src/background/index.ts</code>の接続テスト機能を改善</li>
      </ul>

      <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);">

      <h2>v0.1.0 - 2025-09-26</h2>
      <h3>🎉 初回リリース</h3>
      <ul>
        <li>基本的なウェブクリッピング機能</li>
        <li>Obsidian Local REST API統合</li>
        <li>テンプレートシステム</li>
        <li>AI分類器サポート</li>
        <li>マルチプラットフォームAIチャットエクスポート（ChatGPT、Claude、Geminiなど）</li>
        <li>ドメインマッピング設定</li>
        <li>多言語サポート（中国語、英語、日本語）</li>
      </ul>
    `
  };

  return changelogs[language] || changelogs['zh-CN'];
}
