import { createDefaultPageI18nController, type PageI18nController, configureI18nStorage } from '../i18n';
import { getService } from '../shared/di';
import { resolveRepository } from '../shared/di/serviceRegistry';
import { DI_TOKENS, TOKENS } from '../shared/di/tokens';
import type { INavigationRepository } from '../shared/repositories/INavigationRepository';
import type { StorageService } from '../platform/interfaces/storage';
import type { TabsService } from '../platform/interfaces/tabs';
import type { PlatformServices } from '../platform/types';

let declarativeI18nController: PageI18nController | null = null;

type BrowserStorageLike = Partial<Pick<Storage, 'getItem' | 'setItem'>> & Record<string, unknown>

function getBrowserLocalStorage(): BrowserStorageLike | null {
  const storage = globalThis.localStorage as BrowserStorageLike | undefined;
  return storage ?? null;
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

  return declarativeI18nController;
}

async function applyI18n(): Promise<void> {
  await ensureDeclarativeI18nController();
}

interface OnboardingControllerDependencies {
  storage: StorageService;
  tabs: TabsService;
}

function resolveOnboardingDependencies(): OnboardingControllerDependencies {
  const platform = getService<PlatformServices>(TOKENS.platformServices);
  return {
    storage: platform.storage,
    tabs: platform.tabs
  };
}

export class OnboardingController {
  private dependencies: OnboardingControllerDependencies | null;

  constructor(
    private readonly navigationRepo: INavigationRepository,
    dependencies?: OnboardingControllerDependencies
  ) {
    this.dependencies = dependencies ?? null;
  }

  initialize(): void {
    restoreCompletedSteps();
    updateProgress();
    this.bindEventHandlers();
  }

  private getDependencies(): OnboardingControllerDependencies {
    if (!this.dependencies) {
      this.dependencies = resolveOnboardingDependencies();
    }
    return this.dependencies;
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

    this.bindClick('suggestionsLink', () => this.handleFeedback(), { preventDefault: true });
    this.bindClick('supportLink', () => this.handleSupport(), { preventDefault: true });
    this.bindClick('contactLink', () => this.handleContact(), { preventDefault: true });

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

  private async openOptionsAndMarkStep(stepNumber: number): Promise<void> {
    try {
      await this.navigationRepo.openOptions();
      markStepCompleted(stepNumber);
      updateProgress();
    } catch (error) {
      console.error('[onboarding] Failed to open options page:', error);
    }
  }

  private handleSkipStep(stepNumber: number): void {
    markStepCompleted(stepNumber);
    updateProgress();
  }

  private async handleFeedback(): Promise<void> {
    try {
      await this.navigationRepo.openExternalLink('https://github.com/Lefeaker/AllinOB/issues');
      markStepCompleted(5);
      updateProgress();
    } catch (error) {
      console.error('[onboarding] Failed to open feedback page:', error);
    }
  }

  private async handleSupport(): Promise<void> {
    try {
      await showSupportModal();
      markStepCompleted(5);
      updateProgress();
    } catch (error) {
      console.error('[onboarding] Failed to show support options:', error);
    }
  }

  private handleContact(): void {
    showContactModal();
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
  const navigationRepo = resolveRepository<INavigationRepository>(DI_TOKENS.INavigationRepository);
  const controller = new OnboardingController(navigationRepo, resolveOnboardingDependencies());
  controller.initialize();
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
    const stored = typeof storage?.getItem === 'function'
      ? storage.getItem('onboardingCompletedSteps')
      : null;
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

async function showSupportModal(): Promise<void> {
  const controller = await ensureDeclarativeI18nController();
  const resource = controller.getCurrentResource();
  const messages = resource?.messages;

  const modal = document.createElement('div');
  modal.className = 'support-modal';
  modal.setAttribute('role', 'presentation');
  modal.innerHTML = `
    <div class="support-modal-content">
      <div class="support-modal-header">
        <h3>${messages?.supportModalTitle || '感谢支持'}</h3>
        <button type="button" class="support-modal-close" aria-label="${messages?.contactModalCloseButton || '关闭'}">&times;</button>
      </div>
      <div class="support-modal-body">
        <p>${messages?.supportModalDescription || '开发不易，如果这个插件对您有帮助，欢迎通过以下方式支持：'}</p>
        <div class="support-options">
          <a href="https://ko-fi.com/xiannian" target="_blank" rel="noopener noreferrer" class="support-link">
            <span class="support-icon" data-icon="ko-fi"></span>
            <span>Ko-fi</span>
          </a>
          <a href="https://afdian.com/a/LefShi" target="_blank" rel="noopener noreferrer" class="support-link">
            <span class="support-icon" data-icon="afdian"></span>
            <span>爱发电</span>
          </a>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = (): void => {
    modal.remove();
  };

  modal.querySelector('.support-modal-close')?.addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      close();
    }
  });
}

function showContactModal(): void {
  window.open('https://github.com/Lefeaker/AllinOB', '_blank', 'noopener,noreferrer');
}
