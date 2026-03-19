import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import type { IOptionsRepository } from '@shared/repositories';
import type { PrivacyConsentSnapshot } from '../controls/privacySettings';
import { PrivacySettings } from '../controls/privacySettings';
import { registerPrivacyHandlers, unregisterPrivacyHandlers } from '../sectionRegistry';
import { BaseSection, type SectionRenderContext } from './BaseSection';

export class PrivacySection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private host: HTMLElement | null = null;
  private instance: PrivacySettings | null = null;
  private handlers = {
    refresh: (): Promise<void> => {
      this.renderPrivacySettings();
      return Promise.resolve();
    },
    save: async (options?: { showInlineStatus?: boolean }): Promise<void> => {
      if (!this.instance && this.host) {
        this.renderPrivacySettings();
      }
      if (this.instance) {
        await this.instance.saveSettings(options);
      }
    }
  };

  private unsubscribeFromRepo: (() => void) | null = null;
  private cachedConsent: PrivacyConsentSnapshot | null = null;

  constructor(container: HTMLElement, optionsRepo?: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo ?? resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  }

  protected renderWithState(): HTMLElement {
    this.container.classList.add('aobx-section', 'bg-base-100', 'border', 'border-base-300', 'rounded-lg', 'p-[clamp(22px,2.5vw,32px)]', 'shadow-card');

    const header = this.buildHeader();
    const body = this.buildBody();

    this.container.replaceChildren(header, body);
    unregisterPrivacyHandlers(this.handlers);
    this.renderPrivacySettings();
    registerPrivacyHandlers(this.handlers);
    this.subscribeToRepository();
    return this.container;
  }

  destroy(): void {
    unregisterPrivacyHandlers(this.handlers);
    this.instance = null;
    this.host = null;
    this.unsubscribeFromRepo?.();
    this.unsubscribeFromRepo = null;
    super.destroy();
  }

  private buildHeader(): HTMLElement {
    const header = this.createElement('div', 'grid gap-2 mb-6');
    const titleWrapper = this.createElement('div', 'flex items-center gap-2 text-base-content');
    const title = document.createElement('h2');
    title.className = 'm-0 text-2xl font-semibold tracking-tight';
    title.textContent = this.messages?.privacySettingsTitle ?? '隐私与数据';
    titleWrapper.append(title);

    const subtitle = this.createElement('div', 'text-base-content/60 text-md');
    subtitle.textContent =
      this.messages?.privacySettingsDescription ?? '控制数据收集和错误报告';

    header.append(titleWrapper, subtitle);
    return header;
  }

  private buildBody(): HTMLElement {
    const container = this.createElement('div', 'mt-6 space-y-6');
    container.id = 'privacySettingsContainer';
    this.host = container;
    return container;
  }

  private renderPrivacySettings(): void {
    if (!this.host) {
      return;
    }

    try {
      // ✅ Stage 3 Week 2: PrivacySettings renders DaisyUI cards, checkboxes, and buttons
      this.instance = new PrivacySettings(this.host, {
        ...(this.cachedConsent !== undefined && { initialConsent: this.cachedConsent }),
        onConsentChange: (snapshot) => {
          this.cachedConsent = snapshot;
          this.persistConsent(snapshot);
        }
      });
      if (this.messages) {
        this.instance.setMessages(this.messages);
      }
      this.instance.render();
    } catch (error) {
      console.error('[PrivacySection] Failed to render privacy settings:', error);
      this.host.textContent = 'Failed to load privacy controls. Please reload the page.';
    }
  }

  private subscribeToRepository(): void {
    this.unsubscribeFromRepo?.();
    this.unsubscribeFromRepo = this.optionsRepo.onChange((options) => {
      const snapshot = this.extractConsentSnapshot(options as Partial<{ privacyPreferences?: PrivacyConsentSnapshot }>);
      if (snapshot) {
        this.cachedConsent = snapshot;
        this.instance?.applyConsentSnapshot(snapshot);
      }
    });
  }

  private extractConsentSnapshot(options: Partial<{ privacyPreferences?: PrivacyConsentSnapshot }>): PrivacyConsentSnapshot | null {
    return options.privacyPreferences ?? null;
  }

  private persistConsent(snapshot: PrivacyConsentSnapshot): void {
    void this.optionsRepo
      .set({
        privacyPreferences: snapshot
      })
      .catch((error) => {
        console.error('[PrivacySection] Failed to persist privacy preferences via repository:', error);
      });
  }
}
