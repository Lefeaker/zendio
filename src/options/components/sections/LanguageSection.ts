import { getAvailableLanguages, type Language } from '@i18n';
import type { IOptionsRepository } from '@shared/repositories';
import { UiSelect as DaisySelect } from '@ui/primitives/select';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';
import { changeLanguage } from '../../app/optionsActions';
import { runLanguagePreferenceAction } from '../../app/actions';

interface LanguagePreferenceSnapshot {
  languagePreference?: {
    code?: Language;
  };
}

export class LanguageSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private unsubscribeState: (() => void) | null = null;
  private unsubscribeRepo: (() => void) | null = null;
  private select: HTMLSelectElement | null = null;
  private isProcessing = false;
  private pendingPersistLanguage: Language | null = null;
  private currentLanguage: Language = 'en';

  constructor(container: HTMLElement, optionsRepo: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo;
  }

  protected renderWithState(context: SectionRenderContext): HTMLElement {
    this.applySectionChrome();
    const header = this.buildHeader();
    const body = this.buildBody();
    this.container.replaceChildren(header, body);

    const state = context.stateManager.getState();
    this.syncFromState(state.language);

    this.unsubscribeState?.();
    this.unsubscribeState = context.stateManager.subscribe((nextState) => {
      this.syncFromState(nextState.language);
    });

    this.subscribeToRepository();

    return this.container;
  }

  override destroy(): void {
    this.unsubscribeState?.();
    this.unsubscribeState = null;
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    if (this.select) {
      this.select.removeEventListener('change', this.handleLanguageChange);
    }
    this.select = null;
    super.destroy();
  }

  private buildHeader(): HTMLElement {
    const meta = this.createElement('div', 'text-base-content/60 text-md');
    const selectHost = this.createElement('div');
    const select = new DaisySelect(selectHost).render({
      id: 'languageSelect',
      ariaLabel: this.messages?.languageLabel ?? 'Interface language',
      options: this.getLanguageOptions()
    });
    select.addEventListener('change', this.handleLanguageChange);

    meta.append(selectHost);
    this.select = select;
    return this.buildSectionHeader({
      title: this.messages?.languageSettings ?? 'Language Settings',
      actions: [meta],
      titleClassName: 'm-0 text-2xl font-semibold tracking-tight',
      titleWrapperClassName: 'flex items-center justify-between gap-3 text-base-content flex-wrap'
    });
  }

  private buildBody(): HTMLElement {
    const wrapper = this.createSectionBody();
    const hint = this.createElement(
      'p',
      'text-sm text-base-content/60 bg-base-200 border border-base-300 rounded-md p-3 my-3'
    );
    hint.textContent =
      this.messages?.languageSettings ??
      '修改下拉框后会重新加载界面文字；若翻译未实时更新，请稍候或再次尝试。';
    wrapper.append(hint);
    return wrapper;
  }

  private getLanguageOptions() {
    return getAvailableLanguages().map((language) => ({
      value: language.code,
      label: language.name,
      ...(language.dir === 'rtl' ? { dir: 'rtl' as const } : {}),
      dataAttributes: {
        ...(language.nativeName ? { nativeName: language.nativeName } : {}),
        ...(language.englishName ? { englishName: language.englishName } : {}),
        ...(language.region ? { region: language.region } : {}),
        ...(typeof language.textExpansion === 'number'
          ? { textExpansion: String(language.textExpansion) }
          : {})
      }
    }));
  }

  private syncFromState(language: string): void {
    this.currentLanguage = language as Language;
    if (this.select) {
      this.select.value = language;
    }
  }

  private handleLanguageChange = (event: Event): void => {
    if (this.isProcessing || !this.select) {
      return;
    }

    const nextLanguage = (event.target as HTMLSelectElement).value as Language;
    void this.applyLanguage(nextLanguage, { persist: true });
  };

  private async applyLanguage(language: Language, options: { persist: boolean }): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    if (this.select) {
      this.select.disabled = true;
    }

    try {
      if (options.persist) {
        this.pendingPersistLanguage = language;
      }
      await runLanguagePreferenceAction(
        language,
        {
          changeLanguage,
          optionsRepository: this.optionsRepo
        },
        { persist: options.persist }
      );
      this.currentLanguage = language;
      this.syncFromState(language);
    } catch (error) {
      if (options.persist) {
        this.pendingPersistLanguage = null;
      }
      console.error('[LanguageSection] Failed to change language:', error);
    } finally {
      if (this.select) {
        this.select.disabled = false;
      }
      this.isProcessing = false;
    }
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = this.optionsRepo.onChange((options) => {
      const snapshot = this.extractLanguagePreference(
        options as Partial<LanguagePreferenceSnapshot>
      );
      if (!snapshot) {
        return;
      }
      if (this.pendingPersistLanguage && snapshot === this.pendingPersistLanguage) {
        this.pendingPersistLanguage = null;
        return;
      }
      if (snapshot === this.currentLanguage) {
        return;
      }
      void this.applyLanguage(snapshot, { persist: false });
    });
  }

  private extractLanguagePreference(options: Partial<LanguagePreferenceSnapshot>): Language | null {
    const pref = options.languagePreference?.code;
    return pref ?? null;
  }
}
