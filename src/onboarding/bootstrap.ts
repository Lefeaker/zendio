import {
  createDefaultPageI18nController,
  type PageI18nController,
  configureI18nStorage,
  DEFAULT_RUNTIME_MESSAGES
} from '@i18n';
import type { Messages } from '@i18n/messages';
import type { RendererContext } from '@options/stitch/render/renderStitchView';
import type { PreviewContent, PreviewStoreState, SchemaContext } from '@options/stitch/types';
import { getService } from '../shared/di';
import { resolveRepository } from '../shared/di/serviceRegistry';
import { DI_TOKENS, TOKENS } from '../shared/di/tokens';
import type { INavigationRepository } from '../shared/repositories/INavigationRepository';
import type { IMessagingRepository } from '../shared/repositories/IMessagingRepository';
import type { IOptionsRepository } from '../shared/repositories/IOptionsRepository';
import type { StorageAreaService } from '../platform/interfaces/storage';
import type { StorageService } from '../platform/interfaces/storage';
import type { TabsService } from '../platform/interfaces/tabs';
import type { PlatformServices } from '../platform/types';
import type { InterfaceTheme, PrivacyPreferencesOptions } from '../shared/types/options';
import type { OnboardingTrackingRequest } from './onboardingAnalytics';

let declarativeI18nController: PageI18nController | null = null;

type BrowserStorageLike = Partial<Pick<Storage, 'getItem' | 'setItem'>> & Record<string, unknown>;
type OnboardingBrowserTarget = 'chrome' | 'firefox';
type OnboardingResourceId =
  | 'support'
  | 'suggestions'
  | 'contact'
  | 'changelog'
  | 'privacy-policy'
  | 'terms-of-use';
type OnboardingPrivacyField = 'analytics' | 'errorReporting';
interface OnboardingPrivacySnapshot {
  analytics: boolean;
  errorReporting: boolean;
  debugMode: boolean;
}
interface OnboardingPrivacyOptions {
  privacyPreferences?: Partial<PrivacyPreferencesOptions>;
}
interface OnboardingOptionsRepository {
  get: () => Promise<OnboardingPrivacyOptions>;
  set: (options: { privacyPreferences: OnboardingPrivacySnapshot }) => Promise<void>;
  onChange?: (callback: (options: OnboardingPrivacyOptions) => void) => () => void;
}
type OnboardingConnectionGuideKeys = {
  title: keyof Messages;
  description: keyof Messages;
  details: readonly (keyof Messages)[];
};

const DEFAULT_ONBOARDING_DOCUMENT_TITLE = 'Zendio';
const ZENDIO_OFFICIAL_WEBSITE_URLS = {
  default: 'https://sxnian.com/projects/zendio/en/',
  chinese: 'https://sxnian.com/projects/zendio/'
};
const FIREFOX_CONNECTION_GUIDE_KEYS: OnboardingConnectionGuideKeys = {
  title: 'step1Title',
  description: 'step1Description',
  details: [
    'step1Detail1',
    'step1Detail2',
    'step1Detail3',
    'step1Detail4',
    'step1Detail5',
    'step1Detail6'
  ]
};
const CHROME_CONNECTION_GUIDE_KEYS: OnboardingConnectionGuideKeys = {
  title: 'step1ChromeTitle',
  description: 'step1ChromeDescription',
  details: [
    'step1ChromeDetail1',
    'step1ChromeDetail2',
    'step1ChromeDetail3',
    'step1ChromeDetail4',
    'step1ChromeDetail5',
    'step1ChromeDetail6'
  ]
};

function getBrowserLocalStorage(): BrowserStorageLike | null {
  const storage = globalThis.localStorage as BrowserStorageLike | undefined;
  return storage ?? null;
}

function applyOnboardingDocumentResource(
  resource: ReturnType<PageI18nController['getCurrentResource']>
): void {
  if (typeof document === 'undefined' || !resource) {
    return;
  }

  document.documentElement.lang = resource.language;
  document.title = resource.messages.onboardingDocumentTitle || DEFAULT_ONBOARDING_DOCUMENT_TITLE;
  applyOnboardingConnectionGuideCopy(resource.messages);
}

async function ensureDeclarativeI18nController(): Promise<PageI18nController> {
  if (!declarativeI18nController) {
    const controller = createDefaultPageI18nController();
    await controller.load();

    if (typeof document !== 'undefined') {
      controller.mount(document);
    }

    declarativeI18nController = controller;
  }

  applyOnboardingDocumentResource(declarativeI18nController.getCurrentResource());
  return declarativeI18nController;
}

async function applyI18n(): Promise<void> {
  await ensureDeclarativeI18nController();
}

function resolveOnboardingBrowserTarget(): OnboardingBrowserTarget {
  if (typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function') {
    return 'firefox';
  }

  return 'chrome';
}

function resolveZendioOfficialWebsiteUrl(language: string | null | undefined): string {
  const normalizedLanguage = language?.toLowerCase();
  return normalizedLanguage === 'zh-cn' || normalizedLanguage === 'zh-tw'
    ? ZENDIO_OFFICIAL_WEBSITE_URLS.chinese
    : ZENDIO_OFFICIAL_WEBSITE_URLS.default;
}

function getCurrentOnboardingLanguage(): string | null {
  const resourceLanguage = declarativeI18nController?.getCurrentResource()?.language;
  if (typeof resourceLanguage === 'string' && resourceLanguage.trim().length > 0) {
    return resourceLanguage;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  const documentLanguage =
    document.documentElement.lang || document.documentElement.getAttribute('lang');
  return documentLanguage && documentLanguage.trim().length > 0 ? documentLanguage : null;
}

function resolveOnboardingRuntimeMessage(
  messages: Partial<Messages> | null | undefined,
  key: keyof Messages
): string {
  const raw = messages?.[key] ?? DEFAULT_RUNTIME_MESSAGES[key];
  return typeof raw === 'string' ? raw : '';
}

function applyOnboardingConnectionGuideCopy(messages: Partial<Messages> | null | undefined): void {
  if (typeof document === 'undefined') {
    return;
  }

  const guideKeys =
    resolveOnboardingBrowserTarget() === 'firefox'
      ? FIREFOX_CONNECTION_GUIDE_KEYS
      : CHROME_CONNECTION_GUIDE_KEYS;
  const title = document.querySelector<HTMLElement>('[data-onboarding-step1-title]');
  const description = document.querySelector<HTMLElement>('[data-onboarding-step1-description]');
  title?.replaceChildren(
    document.createTextNode(resolveOnboardingRuntimeMessage(messages, guideKeys.title))
  );
  description?.replaceChildren(
    document.createTextNode(resolveOnboardingRuntimeMessage(messages, guideKeys.description))
  );

  guideKeys.details.forEach((key, index) => {
    const item = document.querySelector<HTMLElement>(
      `[data-onboarding-step1-detail="${String(index + 1)}"]`
    );
    item?.replaceChildren(document.createTextNode(resolveOnboardingRuntimeMessage(messages, key)));
  });
}

interface OnboardingControllerDependencies {
  messagingRepository?: Pick<IMessagingRepository, 'send'>;
  now?: () => number;
  optionsRepository?: OnboardingOptionsRepository;
  storage: StorageService;
  tabs: TabsService;
}

function createMemoryStorageArea(): StorageAreaService {
  const values = new Map<string, unknown>();
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return values.get(key) as T | undefined;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      values.set(key, value);
    },
    async getMany<T = unknown>(keys: string[]): Promise<Record<string, T | undefined>> {
      return Object.fromEntries(keys.map((key) => [key, values.get(key) as T | undefined]));
    },
    async setMany<T = unknown>(entries: Record<string, T>): Promise<void> {
      for (const [key, value] of Object.entries(entries)) {
        values.set(key, value);
      }
    },
    async remove(key: string | string[]): Promise<void> {
      for (const currentKey of Array.isArray(key) ? key : [key]) {
        values.delete(currentKey);
      }
    },
    async clear(): Promise<void> {
      values.clear();
    },
    watchKey(): () => void {
      return () => {};
    },
    watchAll(): () => void {
      return () => {};
    }
  };
}

function createPreviewDependencies(): OnboardingControllerDependencies {
  const sync = createMemoryStorageArea();
  const local = createMemoryStorageArea();
  const session = createMemoryStorageArea();

  return {
    storage: { sync, local, session },
    tabs: {
      async create() {
        return undefined;
      },
      async remove() {},
      async getCurrent() {
        return undefined;
      },
      async get() {
        return undefined;
      },
      async query() {
        return [];
      },
      async sendMessage<TResult = unknown>() {
        return undefined as TResult;
      },
      onActivated() {
        return () => {};
      },
      onUpdated() {
        return () => {};
      },
      onRemoved() {
        return () => {};
      }
    }
  };
}

function hasOptionsRepository(value: unknown): value is OnboardingOptionsRepository {
  const candidate = value as Partial<OnboardingOptionsRepository> | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.get === 'function' &&
    typeof candidate.set === 'function'
  );
}

function hasMessagingRepository(value: unknown): value is Pick<IMessagingRepository, 'send'> {
  const candidate = value as { send?: unknown } | null;
  return (
    typeof candidate === 'object' && candidate !== null && typeof candidate.send === 'function'
  );
}

function resolveOptionalOptionsRepository(): OnboardingOptionsRepository | undefined {
  try {
    const repository = resolveRepository<unknown>(DI_TOKENS.IOptionsRepository);
    return hasOptionsRepository(repository) ? repository : undefined;
  } catch {
    return undefined;
  }
}

function resolveOptionalMessagingRepository(): Pick<IMessagingRepository, 'send'> | undefined {
  try {
    const repository = resolveRepository<unknown>(DI_TOKENS.IMessagingRepository);
    return hasMessagingRepository(repository) ? repository : undefined;
  } catch {
    return undefined;
  }
}

function resolveOnboardingDependencies(): OnboardingControllerDependencies {
  try {
    const platform = getService<PlatformServices>(TOKENS.platformServices);
    const messagingRepository = resolveOptionalMessagingRepository();
    const optionsRepository = resolveOptionalOptionsRepository();
    return {
      ...(messagingRepository ? { messagingRepository } : {}),
      ...(optionsRepository ? { optionsRepository } : {}),
      storage: platform.storage,
      tabs: platform.tabs
    };
  } catch {
    return createPreviewDependencies();
  }
}

export class OnboardingController {
  private dependencies: OnboardingControllerDependencies | null;
  private readonly onboardingStartedAt: number;
  private readonly now: () => number;
  private startedTracked = false;
  private privacySubscriptionActive = false;
  private currentPrivacySnapshot: OnboardingPrivacySnapshot | null = null;

  constructor(
    private readonly navigationRepo: INavigationRepository,
    dependencies?: OnboardingControllerDependencies
  ) {
    this.dependencies = dependencies ?? null;
    this.now = dependencies?.now ?? Date.now;
    this.onboardingStartedAt = this.now();
  }

  initialize(): void {
    restoreCompletedSteps();
    updateProgress();
    this.bindEventHandlers();
    void this.initializePrivacyConsentControls();
    void this.trackOnboardingStarted();
  }

  private getDependencies(): OnboardingControllerDependencies {
    if (!this.dependencies) {
      this.dependencies = resolveOnboardingDependencies();
    }
    return this.dependencies;
  }

  private getOptionsRepository(): OnboardingOptionsRepository | undefined {
    const provided = this.dependencies?.optionsRepository;
    return provided ?? resolveOptionalOptionsRepository();
  }

  private getMessagingRepository(): Pick<IMessagingRepository, 'send'> | undefined {
    const provided = this.dependencies?.messagingRepository;
    return provided ?? resolveOptionalMessagingRepository();
  }

  private async hasAnalyticsConsent(): Promise<boolean> {
    const optionsRepository = this.getOptionsRepository();
    if (!optionsRepository) {
      return false;
    }

    try {
      const options = (await optionsRepository.get()) as {
        privacyPreferences?: { analytics?: boolean };
      };
      return options.privacyPreferences?.analytics === true;
    } catch {
      return false;
    }
  }

  private async sendTrackingRequest(request: OnboardingTrackingRequest): Promise<void> {
    const messagingRepository = this.getMessagingRepository();
    if (!messagingRepository || !(await this.hasAnalyticsConsent())) {
      return;
    }

    try {
      const { sendOnboardingTrackingEvent } = await import('./onboardingAnalytics');
      await sendOnboardingTrackingEvent(messagingRepository, request);
    } catch {
      // Ignore analytics failures so onboarding UX stays unaffected.
    }
  }

  private async trackOnboardingStarted(): Promise<void> {
    if (this.startedTracked) {
      return;
    }
    this.startedTracked = true;
    await this.sendTrackingRequest({ name: 'onboarding_started', source: 'install' });
  }

  private async trackStepCompleted(stepNumber: number): Promise<void> {
    await this.sendTrackingRequest({
      name: 'onboarding_step_completed',
      stepNumber,
      durationMs: this.getOnboardingDurationMs()
    });
  }

  private async trackStepSkipped(stepNumber: number): Promise<void> {
    await this.sendTrackingRequest({ name: 'onboarding_skipped', stepNumber });
  }

  private async trackSupportAction(action: 'contact' | 'feedback' | 'docs'): Promise<void> {
    await this.sendTrackingRequest({ action, name: 'onboarding_support_action' });
  }

  private async trackOnboardingCompleted(): Promise<void> {
    await this.sendTrackingRequest({
      durationMs: this.getOnboardingDurationMs(),
      name: 'onboarding_completed'
    });
  }

  private getOnboardingDurationMs(): number {
    return this.now() - this.onboardingStartedAt;
  }

  private bindEventHandlers(): void {
    this.bindClick('openVault', () => {
      void this.navigationRepo.openVault();
    });

    this.bindClick('configureApiBtn', () => this.openOptionsAndMarkStep(1));
    this.bindClick('skipStep1Btn', () => this.handleSkipStep(1));

    this.bindClick('configureVaultsBtn', () => this.openOptionsAndMarkStep(2));
    this.bindClick('skipStep2Btn', () => this.handleSkipStep(2));

    this.bindClick('exploreSettingsBtn', () => this.openOptionsAndMarkStep(3));
    this.bindClick('skipStep3Btn', () => this.handleSkipStep(3));

    this.bindClick('exploreAuxiliaryBtn', () => this.openOptionsAndMarkStep(4));
    this.bindClick('skipStep4Btn', () => this.handleSkipStep(4));

    this.bindClick('termsOfUseLink', () => this.handleTermsOfUse(), { preventDefault: true });
    this.bindClick('privacyPolicyLink', () => this.handlePrivacyPolicy(), { preventDefault: true });
    this.bindCheckboxChange('onboardingAnalyticsConsent', (checked) =>
      this.persistPrivacyPreference('analytics', checked)
    );
    this.bindCheckboxChange('onboardingErrorReportingConsent', (checked) =>
      this.persistPrivacyPreference('errorReporting', checked)
    );
    this.bindClick('officialWebsiteLink', () => this.handleOfficialWebsite(), {
      preventDefault: true
    });
    this.bindClick('suggestionsLink', () => this.handleFeedback(), { preventDefault: true });
    this.bindClick('supportLink', () => this.handleSupport(), { preventDefault: true });
    this.bindClick('contactLink', () => this.handleContact(), { preventDefault: true });
    this.bindClick('changelogLink', () => this.handleChangelog(), { preventDefault: true });

    this.bindClick('skipOnboardingBtn', () => this.handleSkipOnboarding());
    this.bindClick('completeOnboardingBtn', () => this.handleCompleteOnboarding());
  }

  private bindClick(
    elementId: string,
    handler: () => void | Promise<void>,
    options?: { preventDefault?: boolean }
  ): void {
    const element = document.getElementById(elementId);
    if (!element) {
      return;
    }
    element.addEventListener('click', (event) => {
      if (options?.preventDefault) {
        event.preventDefault();
      }
      void handler();
    });
  }

  private bindCheckboxChange(
    elementId: string,
    handler: (checked: boolean) => void | Promise<void>
  ): void {
    const element = document.getElementById(elementId);
    if (!(element instanceof HTMLInputElement)) {
      return;
    }
    element.addEventListener('change', () => {
      void handler(element.checked);
    });
  }

  private async initializePrivacyConsentControls(): Promise<void> {
    const optionsRepository = this.getOptionsRepository();
    if (!optionsRepository) {
      this.applyPrivacySnapshotToControls({
        analytics: false,
        errorReporting: false,
        debugMode: false
      });
      return;
    }

    try {
      this.applyPrivacySnapshotToControls(
        this.normalizePrivacySnapshot(await optionsRepository.get())
      );
      if (!this.privacySubscriptionActive && typeof optionsRepository.onChange === 'function') {
        this.privacySubscriptionActive = true;
        optionsRepository.onChange((options) => {
          this.applyPrivacySnapshotToControls(this.normalizePrivacySnapshot(options));
        });
      }
    } catch {
      this.applyPrivacySnapshotToControls({
        analytics: false,
        errorReporting: false,
        debugMode: false
      });
    }
  }

  private normalizePrivacySnapshot(
    options: OnboardingPrivacyOptions | null | undefined
  ): OnboardingPrivacySnapshot {
    const current = options?.privacyPreferences;
    return {
      analytics: Boolean(current?.analytics),
      errorReporting: Boolean(current?.errorReporting),
      debugMode: Boolean(current?.debugMode)
    };
  }

  private applyPrivacySnapshotToControls(snapshot: OnboardingPrivacySnapshot): void {
    this.currentPrivacySnapshot = snapshot;
    const analytics = document.getElementById('onboardingAnalyticsConsent');
    const errorReporting = document.getElementById('onboardingErrorReportingConsent');
    if (analytics instanceof HTMLInputElement) {
      analytics.checked = snapshot.analytics;
    }
    if (errorReporting instanceof HTMLInputElement) {
      errorReporting.checked = snapshot.errorReporting;
    }
  }

  private async persistPrivacyPreference(
    field: OnboardingPrivacyField,
    value: boolean
  ): Promise<void> {
    const optionsRepository = this.getOptionsRepository();
    if (!optionsRepository) {
      return;
    }

    try {
      const nextSnapshot = {
        ...(this.currentPrivacySnapshot ??
          this.normalizePrivacySnapshot(await optionsRepository.get())),
        [field]: value
      };
      if ((!nextSnapshot.analytics || !nextSnapshot.errorReporting) && nextSnapshot.debugMode) {
        nextSnapshot.debugMode = false;
      }
      await optionsRepository.set({
        privacyPreferences: nextSnapshot
      });
      this.applyPrivacySnapshotToControls(nextSnapshot);
      await this.applyRuntimePrivacySnapshot(nextSnapshot, field);
    } catch (error) {
      console.error('[onboarding] Failed to persist privacy preference:', error);
      await this.initializePrivacyConsentControls();
    }
  }

  private async applyRuntimePrivacySnapshot(
    snapshot: OnboardingPrivacySnapshot,
    field: OnboardingPrivacyField
  ): Promise<void> {
    try {
      const [{ getAnalyticsConfigManager, setAnalyticsConsent }, { updateErrorAnalyticsConfig }] =
        await Promise.all([
          import('../shared/errors/analytics/analyticsConfig'),
          import('../shared/errors/analytics')
        ]);
      const runtimeDebugMode =
        snapshot.analytics || snapshot.errorReporting ? snapshot.debugMode : false;
      await setAnalyticsConsent(snapshot.analytics, snapshot.errorReporting);
      await getAnalyticsConfigManager().updateConfig({ debugMode: runtimeDebugMode });
      if (field === 'errorReporting') {
        await updateErrorAnalyticsConfig(snapshot.errorReporting);
      }
    } catch {
      // Runtime privacy sync is best-effort; persisted Options state remains the source of truth.
    }
  }

  private async openOptionsAndMarkStep(stepNumber: number): Promise<void> {
    try {
      await this.navigationRepo.openOptions();
      markStepCompleted(stepNumber);
      updateProgress();
      await this.trackStepCompleted(stepNumber);
    } catch (error) {
      console.error('[onboarding] Failed to open options page:', error);
    }
  }

  private async handleSkipStep(stepNumber: number): Promise<void> {
    markStepCompleted(stepNumber);
    updateProgress();
    await this.trackStepSkipped(stepNumber);
  }

  private async handleFeedback(): Promise<void> {
    try {
      await openOnboardingResourceModal('suggestions');
      markStepCompleted(5);
      updateProgress();
      await this.trackSupportAction('feedback');
      await this.trackStepCompleted(5);
    } catch (error) {
      console.error('[onboarding] Failed to open feedback page:', error);
    }
  }

  private async handleTermsOfUse(): Promise<void> {
    await openOnboardingResourceModal('terms-of-use');
  }

  private async handlePrivacyPolicy(): Promise<void> {
    await openOnboardingResourceModal('privacy-policy');
  }

  private async handleOfficialWebsite(): Promise<void> {
    try {
      await this.navigationRepo.openExternalLink(
        resolveZendioOfficialWebsiteUrl(getCurrentOnboardingLanguage())
      );
    } catch (error) {
      console.error('[onboarding] Failed to open official website:', error);
    }
  }

  private async handleSupport(): Promise<void> {
    try {
      await openOnboardingResourceModal('support');
      markStepCompleted(5);
      updateProgress();
      await this.trackSupportAction('docs');
      await this.trackStepCompleted(5);
    } catch (error) {
      console.error('[onboarding] Failed to show support options:', error);
    }
  }

  private async handleContact(): Promise<void> {
    await openOnboardingResourceModal('contact');
    await this.trackSupportAction('contact');
  }

  private async handleChangelog(): Promise<void> {
    await openOnboardingResourceModal('changelog');
  }

  private async handleSkipOnboarding(): Promise<void> {
    await this.completeOnboarding();
    await this.closeOnboardingTab();
  }

  private async handleCompleteOnboarding(): Promise<void> {
    await this.completeOnboarding();
    await this.closeOnboardingTab();
  }

  private async completeOnboarding(): Promise<void> {
    try {
      await this.getDependencies().storage.local.set('onboardingCompleted', true);
      await this.trackOnboardingCompleted();
      console.log('[onboarding] Onboarding marked as completed');
    } catch (error) {
      console.error('[onboarding] Failed to mark onboarding as completed:', error);
    }
  }

  private async closeOnboardingTab(): Promise<void> {
    try {
      const currentTab = await this.getDependencies().tabs.getCurrent();
      if (currentTab?.id !== undefined) {
        await this.getDependencies().tabs.remove(currentTab.id);
      }
    } catch (error) {
      console.error('[onboarding] Failed to close onboarding tab:', error);
    }
  }
}

export async function bootstrapOnboardingApp(): Promise<void> {
  configureI18nStorage(resolveOnboardingDependencies().storage.sync);
  await applyI18n();
  await applyStoredOnboardingTheme();
  const navigationRepo = resolveRepository<INavigationRepository>(DI_TOKENS.INavigationRepository);
  const controller = new OnboardingController(navigationRepo, resolveOnboardingDependencies());
  controller.initialize();
}

async function applyStoredOnboardingTheme(): Promise<void> {
  try {
    const optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
    const options = await optionsRepository.get();
    applyOnboardingTheme(options.interfaceTheme);
  } catch {
    applyOnboardingTheme(resolveStoredThemePreference());
  }
}

function applyOnboardingTheme(preference: InterfaceTheme | undefined): void {
  const resolvedTheme = resolvePreviewTheme(preference);
  document.documentElement.dataset.previewTheme = resolvedTheme;
  document.documentElement.dataset.theme = resolvedTheme;
  document.body.dataset.previewTheme = resolvedTheme;
}

function resolvePreviewTheme(preference: InterfaceTheme | undefined): 'dark' | 'light' {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }
  return resolveSystemTheme();
}

function resolveStoredThemePreference(): InterfaceTheme {
  try {
    const stored = window.localStorage.getItem('aob-theme');
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage can be unavailable in isolated test contexts.
  }
  return 'system';
}

function resolveSystemTheme(): 'dark' | 'light' {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

function markStepCompleted(stepNumber: number): void {
  const step = document.getElementById(`step${stepNumber}`);
  if (step) {
    step.classList.add('step-completed');
  }

  const completedSteps = getCompletedSteps();
  if (!completedSteps.includes(stepNumber)) {
    completedSteps.push(stepNumber);
    const storage = getBrowserLocalStorage();
    if (typeof storage?.setItem === 'function') {
      storage.setItem('onboardingCompletedSteps', JSON.stringify(completedSteps));
    }
  }
}

function getCompletedSteps(): number[] {
  try {
    const storage = getBrowserLocalStorage();
    const stored =
      typeof storage?.getItem === 'function' ? storage.getItem('onboardingCompletedSteps') : null;
    if (!stored) {
      return [];
    }
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed
        .map((value) => Number(value))
        .filter((value): value is number => Number.isFinite(value));
    }
    return [];
  } catch {
    return [];
  }
}

function restoreCompletedSteps(): void {
  for (const stepNumber of getCompletedSteps()) {
    const step = document.getElementById(`step${stepNumber}`);
    step?.classList.add('step-completed');
  }
}

function updateProgress(): void {
  const completedSteps = getCompletedSteps();
  const totalSteps = 5;
  const progress = (completedSteps.length / totalSteps) * 100;

  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }

  if (completedSteps.length === totalSteps) {
    const skipBtn = document.getElementById('skipOnboardingBtn');
    const completeBtn = document.getElementById('completeOnboardingBtn');

    if (skipBtn) skipBtn.classList.add('hidden');
    if (completeBtn) completeBtn.classList.remove('hidden');
  }
}

function parseOnboardingResourceId(value: string | undefined): OnboardingResourceId | null {
  switch (value) {
    case 'support':
    case 'suggestions':
    case 'contact':
    case 'changelog':
    case 'privacy-policy':
    case 'terms-of-use':
      return value;
    default:
      return null;
  }
}

function closeOnboardingResourceModals(): void {
  document.querySelectorAll('.resource-modal-overlay').forEach((modal) => modal.remove());
}

function createOnboardingSchemaContext({
  appData,
  language,
  messages,
  state,
  t
}: {
  appData: PreviewContent;
  language: string;
  messages: Messages;
  state: PreviewStoreState;
  t: SchemaContext['t'];
}): SchemaContext {
  return {
    appData,
    state,
    language,
    messages,
    t
  };
}

function handleOnboardingResourceAction(actionId: string, resourceId?: string): void {
  switch (actionId) {
    case 'resource:close':
      closeOnboardingResourceModals();
      return;
    case 'resource:open': {
      const nextResourceId = parseOnboardingResourceId(resourceId);
      if (nextResourceId) {
        void openOnboardingResourceModal(nextResourceId);
      }
      return;
    }
    default:
      return;
  }
}

async function openOnboardingResourceModal(resourceId: OnboardingResourceId): Promise<void> {
  const controller = await ensureDeclarativeI18nController();
  const resource = controller.getCurrentResource();
  if (!resource) {
    return;
  }

  const [
    { previewContent },
    { getFooterView },
    { createSchemaTranslator },
    { renderStitchView },
    { el },
    { previewUi },
    { resolveProductionStitchAssetUrl },
    { createInitialStitchState }
  ] = await Promise.all([
    import('@options/stitch/content'),
    import('@options/stitch/schema/registry'),
    import('@options/stitch/schema/i18n'),
    import('@options/stitch/render/renderStitchView'),
    import('@options/stitch/ui/dom'),
    import('@options/stitch/ui/components'),
    import('@options/app/productionStitchAssetUrlResolver'),
    import('@options/app/productionStitchStateMapper')
  ]);
  const messages = resource.messages;
  const state = createInitialStitchState(previewContent);
  const schemaContext = createOnboardingSchemaContext({
    appData: previewContent,
    language: resource.language,
    messages,
    state,
    t: createSchemaTranslator(messages)
  });
  const view = getFooterView(resourceId, schemaContext);
  if (!view) {
    return;
  }

  const renderContext: RendererContext = {
    ...schemaContext,
    el,
    ui: previewUi,
    dispatch: (actionId, args) =>
      handleOnboardingResourceAction(
        actionId,
        args?.[0] === undefined ? undefined : String(args[0])
      ),
    resolveAssetUrl: resolveProductionStitchAssetUrl,
    mountWidget: () => {}
  };

  closeOnboardingResourceModals();
  const modal = renderStitchView(view, renderContext);
  if (modal) {
    document.body.append(modal);
  }
}
