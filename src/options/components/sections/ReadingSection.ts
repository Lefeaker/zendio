import type { CompleteOptions, StoredOptions, ReadingSessionOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import { getOptionsController, markPendingAutoSave } from '../../app/optionsControllerContext';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import { UiButton as DaisyButton } from '@ui/primitives/button';
import { DaisyCard } from '@ui/primitives/card';
import { createOptionsHintText } from '@ui/primitives/layout';
import { DaisyRadioGroup } from '@ui/primitives/radio-group';
import { UiSelect as DaisySelect } from '@ui/primitives/select';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';

const HIGHLIGHT_THEMES = ['gradient', 'purple', 'neonYellow', 'neonGreen', 'neonOrange'] as const;
const HIGHLIGHT_THEME_CLASS_MAP: Record<(typeof HIGHLIGHT_THEMES)[number], string> = {
  gradient: 'bg-gradient-to-br from-[#7c3aed] to-[#3b82f6]',
  purple: 'bg-[#a855f7]',
  neonYellow: 'bg-[#facc15]',
  neonGreen: 'bg-[#4ade80]',
  neonOrange: 'bg-[#fb923c]'
};

export class ReadingSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private exportModeSelect: HTMLSelectElement | null = null;
  private themeContainer: HTMLElement | null = null;
  private themeButtons: HTMLButtonElement[] = [];
  private selectedTheme: string = HIGHLIGHT_THEMES[0];
  private previewHighlightSwatch: HTMLElement | null = null;
  private previewModeText: HTMLElement | null = null;
  private unsubscribeRepo: (() => void) | null = null;

  constructor(container: HTMLElement, optionsRepo: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo;
  }

  protected renderWithState(_context: SectionRenderContext): HTMLElement {
    this.dispose();
    this.applySectionChrome(['transition-opacity', 'duration-200']);

    const header = this.buildHeader();
    const body = this.buildBody();

    this.container.replaceChildren(header, body);

    this.bindEvents();
    this.registerFormIntegration();
    this.subscribeToRepository();
    return this.container;
  }

  override destroy(): void {
    this.dispose();
    this.unregisterManagedFormSection();
    super.destroy();
  }

  private dispose(): void {
    if (this.exportModeSelect) {
      this.exportModeSelect.removeEventListener('change', this.handleValueChanged);
    }
    if (this.themeContainer) {
      this.themeContainer.removeEventListener('keydown', this.handleThemeKeydown);
    }
    this.themeButtons = [];
    this.exportModeSelect = null;
    this.themeContainer = null;
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
  }

  private registerFormIntegration(): void {
    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    };
    this.registerManagedFormSection('readingSession', binding);
  }

  private buildHeader(): HTMLElement {
    return this.buildSectionHeader({
      title: this.messages?.readingConfigTitle ?? '阅读模式',
      description: this.messages?.readingConfigHint ?? '选择导出阅读模式时保存的内容形式'
    });
  }

  private buildBody(): HTMLElement {
    const wrapper = this.createElement('div', 'grid gap-6');
    const settings = this.createSectionSettings();

    const modeSetting = this.createSettingRow();
    const modeLabel = this.createElement('label', 'text-sm font-medium text-base-content/60', {
      for: 'readingExportMode'
    });
    modeLabel.textContent = this.messages?.readingExportModeLabel ?? '导出内容';
    const modeControl = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const modeSelectHost = this.createElement('div', 'w-full');
    const modeSelect = new DaisySelect(modeSelectHost).render({
      id: 'readingExportMode',
      options: [
        {
          value: 'highlights',
          label: this.messages?.readingExportModeHighlights ?? '仅保存高亮片段'
        },
        {
          value: 'full',
          label: this.messages?.readingExportModeFull ?? '保存全文并标注高亮'
        }
      ]
    });
    modeControl.append(modeSelectHost);
    const modeHint = createOptionsHintText({ tag: 'div' });
    modeHint.textContent =
      this.messages?.readingExportModeDescription ??
      '选择“全文”时，会同时保存经过清洗的原文，并在全文中保留你的高亮与脚注。';
    modeSetting.append(modeLabel, modeControl, modeHint);
    settings.append(modeSetting);
    this.exportModeSelect = modeSelect;

    const themeSetting = this.createSettingRow();
    const themeLabel = this.createElement('div', 'text-sm font-medium text-base-content/60');
    themeLabel.id = 'readingHighlightThemeLabel';
    themeLabel.textContent = this.messages?.readingHighlightThemeLabel ?? '高亮颜色';
    const themeOptionsHost = this.createElement('div');
    const themeOptions = new DaisyRadioGroup(themeOptionsHost).render({
      id: 'readingHighlightTheme',
      ariaLabelledBy: 'readingHighlightThemeLabel',
      value: HIGHLIGHT_THEMES[0],
      options: HIGHLIGHT_THEMES.map((theme) => ({
        value: theme,
        label: this.resolveThemeLabel(theme),
        srLabel: this.resolveThemeLabel(theme),
        swatchClassName: HIGHLIGHT_THEME_CLASS_MAP[theme]
      })),
      onChange: (theme) => {
        this.updateThemeSelection(theme);
        this.handleValueChanged();
      }
    });
    this.themeButtons = Array.from(
      themeOptions.querySelectorAll<HTMLButtonElement>('button[role="radio"]')
    );
    const themeHint = createOptionsHintText({ tag: 'div' });
    themeHint.textContent =
      this.messages?.readingHighlightThemeDescription ??
      '仅影响阅读模式页面的高亮背景，不会改变导出的 Markdown 内容。';
    themeSetting.append(themeLabel, themeOptionsHost, themeHint);
    settings.append(themeSetting);
    this.themeContainer = themeOptions;

    wrapper.append(settings, this.buildPreviewCard(), this.buildActionRow());
    // ⏸️ Stage 3 Month 3: Template editor pending Monaco/CodeMirror integration
    // 当前保留最简配置项，等待富文本模板能力落地后统一替换。
    return wrapper;
  }

  private bindEvents(): void {
    if (this.exportModeSelect) {
      this.exportModeSelect.addEventListener('change', () => {
        this.updatePreviewContent();
        this.handleValueChanged();
      });
    }

    if (this.themeContainer) {
      this.themeContainer.addEventListener('keydown', this.handleThemeKeydown);
    }
  }

  private handleValueChanged = (): void => {
    markPendingAutoSave('readingSession');
    const controller = getOptionsController();
    controller?.scheduleAutoSave();
  };

  private handleThemeKeydown = (event: KeyboardEvent): void => {
    if (!this.themeButtons.length) {
      return;
    }
    const currentIndex = this.themeButtons.findIndex(
      (button) => button.dataset.theme === this.selectedTheme
    );
    if (currentIndex === -1) {
      return;
    }

    let nextIndex = currentIndex;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + this.themeButtons.length) % this.themeButtons.length;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % this.themeButtons.length;
    } else {
      return;
    }

    event.preventDefault();
    const nextButton = this.themeButtons[nextIndex];
    const theme = nextButton.dataset.theme;
    if (!theme) {
      return;
    }
    this.updateThemeSelection(theme);
    nextButton.focus();
    this.handleValueChanged();
  };

  private updateThemeSelection(theme: string): void {
    if (!this.themeContainer || !this.themeButtons.length) {
      return;
    }

    const normalized = HIGHLIGHT_THEMES.includes(theme as (typeof HIGHLIGHT_THEMES)[number])
      ? theme
      : HIGHLIGHT_THEMES[0];
    this.selectedTheme = normalized;
    this.themeContainer.dataset.selectedTheme = normalized;
    this.themeButtons.forEach((button) => {
      const isCurrent = button.dataset.theme === normalized;
      if (isCurrent) {
        button.classList.add('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-surface-0');
      } else {
        button.classList.remove('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-surface-0');
      }
      button.setAttribute('aria-checked', isCurrent ? 'true' : 'false');
      button.tabIndex = isCurrent ? 0 : -1;
    });
    this.updatePreviewContent();
  }

  private applySnapshot(options: StoredOptions): void {
    const readingSession = options.readingSession;
    const exportMode = readingSession?.exportMode ?? 'highlights';
    const highlightTheme = readingSession?.highlightTheme ?? HIGHLIGHT_THEMES[0];

    if (this.exportModeSelect) {
      this.exportModeSelect.value = exportMode;
    }
    this.updateThemeSelection(highlightTheme);
  }

  private collectChanges(previous: StoredOptions | null): Partial<CompleteOptions> {
    const previousReading = previous?.readingSession;

    const exportMode = this.exportModeSelect?.value ?? previousReading?.exportMode ?? 'highlights';
    const highlightTheme = HIGHLIGHT_THEMES.includes(
      this.selectedTheme as (typeof HIGHLIGHT_THEMES)[number]
    )
      ? (this.selectedTheme as (typeof HIGHLIGHT_THEMES)[number])
      : (previousReading?.highlightTheme ?? 'gradient');

    const partial: Partial<CompleteOptions> = {
      readingSession: {
        exportMode: exportMode as ReadingSessionOptions['exportMode'],
        highlightTheme: highlightTheme as ReadingSessionOptions['highlightTheme']
      }
    };
    return partial;
  }

  private buildPreviewCard(): HTMLElement {
    const host = this.createElement('div');
    const previewBody = this.createElement('div', 'space-y-3 text-sm text-base-content');
    const intro = this.createElement('p', 'm-0');
    intro.textContent =
      this.messages?.readingConfigHint ?? '根据当前导出方式与高亮主题预览保存效果：';

    const highlightPreview = this.createElement(
      'div',
      ['rounded-lg', 'border', 'border-base-300', 'bg-base-200/70', 'p-3'].join(' ')
    );
    const highlightSwatch = this.createElement(
      'span',
      [
        'inline-flex',
        'items-center',
        'px-3',
        'py-1',
        'text-xs',
        'font-semibold',
        'text-base-100',
        'rounded-full',
        'shadow-sm'
      ].join(' ')
    );
    highlightSwatch.textContent = this.messages?.readingHighlightThemeLabel ?? '示例高亮';
    highlightPreview.append(highlightSwatch);
    this.previewHighlightSwatch = highlightSwatch;

    const modeText = this.createElement('p', 'text-xs text-base-content/70 m-0');
    this.previewModeText = modeText;

    previewBody.append(intro, highlightPreview, modeText);

    const card = new DaisyCard(host);
    card.render({
      title: this.messages?.readingConfigTitle ?? '导出预览',
      body: previewBody
    });
    this.updatePreviewContent();
    return host;
  }

  private buildActionRow(): HTMLElement {
    const actionRow = this.createElement(
      'div',
      ['flex', 'flex-wrap', 'gap-3', 'items-center', 'border-t', 'border-base-300', 'pt-4'].join(
        ' '
      )
    );
    const saveHost = this.createElement('div');
    // ✅ Stage 3 Week 4: Migrated save button to DaisyButton (ReadingSection)
    new DaisyButton(saveHost).render({
      label: this.messages?.readingExportModeLabel ?? '保存阅读配置',
      variant: 'primary',
      size: 'sm',
      iconName: 'Save',
      onClick: () => {
        const controller = getOptionsController();
        controller?.scheduleAutoSave();
      }
    });
    actionRow.append(saveHost);
    return actionRow;
  }

  private updatePreviewContent(): void {
    if (!this.previewHighlightSwatch || !this.previewModeText) {
      return;
    }
    const theme = HIGHLIGHT_THEMES.includes(this.selectedTheme as (typeof HIGHLIGHT_THEMES)[number])
      ? (this.selectedTheme as (typeof HIGHLIGHT_THEMES)[number])
      : HIGHLIGHT_THEMES[0];
    this.previewHighlightSwatch.className = `inline-flex items-center px-3 py-1 text-xs font-semibold text-base-100 rounded-full shadow-sm ${HIGHLIGHT_THEME_CLASS_MAP[theme]}`;
    const modeValue = this.exportModeSelect?.value ?? 'highlights';
    const modeLabel =
      modeValue === 'full'
        ? (this.messages?.readingExportModeFull ?? '保存全文并标注高亮')
        : (this.messages?.readingExportModeHighlights ?? '仅保存高亮片段');
    this.previewModeText.textContent = `${modeLabel} · ${this.resolveThemeLabel(theme)}`;
  }

  private resolveThemeLabel(theme: (typeof HIGHLIGHT_THEMES)[number]): string {
    switch (theme) {
      case 'purple':
        return this.messages?.readingHighlightThemePurple ?? '纯紫色';
      case 'neonYellow':
        return this.messages?.readingHighlightThemeNeonYellow ?? '荧光黄';
      case 'neonGreen':
        return this.messages?.readingHighlightThemeNeonGreen ?? '荧光绿';
      case 'neonOrange':
        return this.messages?.readingHighlightThemeNeonOrange ?? '荧光橙';
      case 'gradient':
      default:
        return this.messages?.readingHighlightThemeGradient ?? '渐变紫蓝（默认）';
    }
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = this.optionsRepo.onChange((options) => {
      this.applySnapshot(options);
    });
  }
}
