import {
  createDefaultPageI18nController,
  type PageI18nController,
  configureI18nStorage,
  DEFAULT_RUNTIME_MESSAGES
} from '@i18n';
import type { Messages } from '@i18n/messages';
import { resolveRepository } from '../shared/di/serviceRegistry';
import { DI_TOKENS } from '../shared/di/tokens';
import { resolveZendioOfficialWebsiteUrl } from '../shared/links/zendioOfficialWebsite';
import type { INavigationRepository } from '../shared/repositories/INavigationRepository';
import {
  resolveOnboardingDependencies,
  resolveOptionalMessagingRepository,
  resolveOptionalOptionsRepository
} from './dependencies';
import type { BrowserTarget } from '../platform/interfaces/runtime';
import type {
  OnboardingControllerDependencies,
  OnboardingOptionsRepository,
  OnboardingPrivacyField,
  OnboardingPrivacyOptions,
  OnboardingPrivacySnapshot
} from './dependencies';
import type { OnboardingTrackingRequest } from './onboardingAnalytics';
import { markStepCompleted, restoreCompletedSteps, updateProgress } from './progress';
import { renderOnboardingResourceModal } from './resourceModal';
import type { OnboardingResourceId } from './resourceModal';
import { applyStoredOnboardingTheme } from './theme';

let declarativeI18nController: PageI18nController | null = null;
let onboardingBrowserTarget: BrowserTarget = 'chrome';
let onboardingResourceAssetUrlResolver: ((path: string) => string) | undefined;

type OnboardingConnectionGuideKeys = {
  title: keyof Messages;
  description: keyof Messages;
  details: readonly (keyof Messages)[];
};

const DEFAULT_ONBOARDING_DOCUMENT_TITLE = 'Zendio';
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
    onboardingBrowserTarget === 'firefox'
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

  private getMessagingRepository(): OnboardingControllerDependencies['messagingRepository'] {
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
      const [
        { getAnalyticsConfigManager, setAnalyticsConsent },
        { updateErrorAnalyticsConfig },
        { resolveAnalyticsDebugMode }
      ] = await Promise.all([
        import('../shared/errors/analytics/analyticsConfig'),
        import('../shared/errors/analytics'),
        import('../shared/analytics')
      ]);
      const runtimeDebugMode = resolveAnalyticsDebugMode(snapshot);
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
  const dependencies = resolveOnboardingDependencies();
  onboardingBrowserTarget = dependencies.runtime?.getBrowserTarget() ?? 'chrome';
  onboardingResourceAssetUrlResolver = dependencies.runtime
    ? (path) => dependencies.runtime!.getURL(path)
    : undefined;
  configureI18nStorage(dependencies.storage.sync);
  await applyI18n();
  await applyStoredOnboardingTheme();
  const navigationRepo = resolveRepository<INavigationRepository>(DI_TOKENS.INavigationRepository);
  const controller = new OnboardingController(navigationRepo, dependencies);
  controller.initialize();
}

async function openOnboardingResourceModal(resourceId: OnboardingResourceId): Promise<void> {
  const controller = await ensureDeclarativeI18nController();
  const resource = controller.getCurrentResource();
  if (!resource) {
    return;
  }
  renderOnboardingResourceModal({
    language: resource.language,
    messages: resource.messages,
    resolveAssetUrl: onboardingResourceAssetUrlResolver,
    resourceId
  });
}
