import type { IOptionsRepository } from '@shared/repositories';
import type { PrivacyConsentSnapshot } from '@ui/domains/privacy';
import { PrivacySettings } from '@ui/domains/privacy';
import { BaseSection, type SectionRenderContext } from './BaseSection';
import { persistPrivacyConsentAction } from '../../app/actions';

export class PrivacySection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private host: HTMLElement | null = null;
  private instance: PrivacySettings | null = null;
  private unsubscribeFromRepo: (() => void) | null = null;
  private cachedConsent: PrivacyConsentSnapshot | null = null;

  constructor(container: HTMLElement, optionsRepo: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo;
  }

  protected renderWithState(): HTMLElement {
    this.applySectionChrome();

    const header = this.buildHeader();
    const body = this.buildBody();

    this.container.replaceChildren(header, body);
    this.renderPrivacySettings();
    this.subscribeToRepository();
    return this.container;
  }

  async refreshSettings(): Promise<void> {
    this.renderPrivacySettings();
  }

  async saveSettings(options?: { showInlineStatus?: boolean }): Promise<void> {
    if (!this.instance && this.host) {
      this.renderPrivacySettings();
    }
    if (this.instance) {
      await this.instance.saveSettings(options);
    }
  }

  destroy(): void {
    this.instance = null;
    this.host = null;
    this.unsubscribeFromRepo?.();
    this.unsubscribeFromRepo = null;
    super.destroy();
  }

  private buildHeader(): HTMLElement {
    return this.buildSectionHeader({
      title: this.messages?.privacySettingsTitle ?? '隐私与数据',
      description: this.messages?.privacySettingsDescription ?? '控制数据收集和错误报告'
    });
  }

  private buildBody(): HTMLElement {
    const container = this.createSectionBody();
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
      this.host.textContent =
        this.messages?.privacySettingsError ?? 'Failed to save settings, please try again.';
    }
  }

  private subscribeToRepository(): void {
    this.unsubscribeFromRepo?.();
    this.unsubscribeFromRepo = this.optionsRepo.onChange((options) => {
      const snapshot = this.extractConsentSnapshot(
        options as Partial<{ privacyPreferences?: PrivacyConsentSnapshot }>
      );
      if (snapshot) {
        this.cachedConsent = snapshot;
        this.instance?.applyConsentSnapshot(snapshot);
      }
    });
  }

  private extractConsentSnapshot(
    options: Partial<{ privacyPreferences?: PrivacyConsentSnapshot }>
  ): PrivacyConsentSnapshot | null {
    return options.privacyPreferences ?? null;
  }

  private persistConsent(snapshot: PrivacyConsentSnapshot): void {
    void persistPrivacyConsentAction(snapshot, {
      optionsRepository: this.optionsRepo
    })
      .catch((error) => {
        console.error(
          '[PrivacySection] Failed to persist privacy preferences via repository:',
          error
        );
      });
  }
}
