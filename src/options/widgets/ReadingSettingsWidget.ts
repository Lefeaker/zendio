import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';
import type {
  CompleteOptions,
  ReaderHighlightTheme,
  ReadingExportMode,
  StoredOptions
} from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import type { BaseWidgetProps, WidgetMountContract, WidgetRuntime } from './contracts';
import { asOptionsSnapshot, clearWidgetContainer, createElement, notifyWidgetDirty } from './utils';

const EXPORT_MODES: readonly ReadingExportMode[] = ['highlights', 'full'];
const HIGHLIGHT_THEMES: readonly ReaderHighlightTheme[] = [
  'gradient',
  'purple',
  'neonYellow',
  'neonGreen',
  'neonOrange'
];
const THEME_STYLE: Record<ReaderHighlightTheme, string> = {
  gradient: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
  purple: '#a855f7',
  neonYellow: '#facc15',
  neonGreen: '#4ade80',
  neonOrange: '#fb923c'
};

export interface ReadingSettingsWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class ReadingSettingsWidget
  implements
    WidgetMountContract<
      ReadingSettingsWidgetProps,
      Partial<CompleteOptions>,
      StoredOptions | CompleteOptions | null
    >
{
  private container: HTMLElement | null = null;
  private props: ReadingSettingsWidgetProps = {};
  private runtime: WidgetRuntime | undefined;
  private exportModeSelect: HTMLSelectElement | null = null;
  private themeButtons: HTMLButtonElement[] = [];
  private selectedTheme: ReaderHighlightTheme = 'gradient';
  private previewHighlight: HTMLElement | null = null;
  private previewModeText: HTMLElement | null = null;
  private unsubscribeRepo: (() => void) | null = null;

  constructor(private readonly optionsRepository?: IOptionsRepository) {}

  mount(container: HTMLElement, props: ReadingSettingsWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.props = props;
    this.runtime = runtime;
    this.render();
    this.applySnapshot(props.options ?? null);
    this.subscribeToRepository();
  }

  update(props: ReadingSettingsWidgetProps, runtime?: WidgetRuntime): void {
    const draft = this.collect();
    this.props = props;
    this.runtime = runtime ?? this.runtime;
    this.render();
    this.applySnapshot({ ...(props.options ?? {}), ...draft } as StoredOptions);
  }

  destroy(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    clearWidgetContainer(this.container);
    this.container = null;
    this.exportModeSelect = null;
    this.themeButtons = [];
    this.previewHighlight = null;
    this.previewModeText = null;
  }

  collect(): Partial<CompleteOptions> {
    const exportMode = this.normalizeExportMode(this.exportModeSelect?.value);
    return {
      readingSession: {
        exportMode,
        highlightTheme: this.selectedTheme
      }
    };
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | null): void {
    const options = asOptionsSnapshot(snapshot);
    const reading = options.readingSession ?? DEFAULT_OPTIONS.readingSession;
    const exportMode = this.normalizeExportMode(reading?.exportMode);
    const theme = this.normalizeTheme(reading?.highlightTheme);

    if (this.exportModeSelect) {
      this.exportModeSelect.value = exportMode;
    }
    this.updateThemeSelection(theme);
    this.updatePreview();
  }

  private render(): void {
    if (!this.container) {
      return;
    }

    const root = createElement('div', 'schema-widget-stack');
    root.append(this.buildExportModeRow(), this.buildThemeRow(), this.buildPreview());
    this.container.replaceChildren(root);
  }

  private buildExportModeRow(): HTMLElement {
    const row = createElement('div', 'schema-row');
    const label = createElement('div', 'schema-row-label');
    const title = document.createElement('strong');
    title.textContent = this.props.messages?.readingExportModeLabel ?? '导出内容';
    const description = document.createElement('span');
    description.textContent =
      this.props.messages?.readingExportModeDescription ??
      '选择全文时，会同时保存经过清洗的原文，并保留高亮与脚注。';
    label.append(title, description);

    const control = createElement('div', 'schema-row-control');
    const select = document.createElement('select');
    select.className = 'schema-select';
    EXPORT_MODES.forEach((mode) => {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent = this.resolveExportModeLabel(mode);
      select.append(option);
    });
    select.addEventListener('change', () => {
      this.updatePreview();
      this.markDirty();
    });
    this.exportModeSelect = select;
    control.append(select);
    row.append(label, control);
    return row;
  }

  private buildThemeRow(): HTMLElement {
    const row = createElement('div', 'schema-row');
    const label = createElement('div', 'schema-row-label');
    const title = document.createElement('strong');
    title.textContent = this.props.messages?.readingHighlightThemeLabel ?? '高亮颜色';
    const description = document.createElement('span');
    description.textContent =
      this.props.messages?.readingHighlightThemeDescription ??
      '仅影响阅读模式页面的高亮背景，不会改变导出的 Markdown 内容。';
    label.append(title, description);

    const control = createElement('div', 'schema-row-control');
    const group = createElement('div', 'schema-theme-row');
    this.themeButtons = HIGHLIGHT_THEMES.map((theme) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'schema-theme-button';
      button.dataset.theme = theme;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-label', this.resolveThemeLabel(theme));
      button.title = this.resolveThemeLabel(theme);
      button.style.background = THEME_STYLE[theme];
      button.addEventListener('click', () => {
        this.updateThemeSelection(theme);
        this.markDirty();
      });
      group.append(button);
      return button;
    });
    group.addEventListener('keydown', (event) => this.handleThemeKeydown(event));
    control.append(group);
    row.append(label, control);
    return row;
  }

  private buildPreview(): HTMLElement {
    const preview = createElement('section', 'schema-card');
    const body = createElement('div', 'schema-card-body schema-reading-preview');
    const sentence = document.createElement('p');
    sentence.textContent =
      this.props.messages?.readingConfigHint ?? '根据当前导出方式与高亮主题预览保存效果：';
    const example = document.createElement('p');
    const before = document.createTextNode('The reader keeps ');
    const highlight = document.createElement('span');
    highlight.className = 'schema-reading-preview-highlight';
    highlight.textContent = this.props.messages?.readingHighlightThemeLabel ?? 'selected passages';
    const after = document.createTextNode(' visible while preserving the source article.');
    example.append(before, highlight, after);
    const mode = createElement('p', 'schema-widget-hint');
    this.previewHighlight = highlight;
    this.previewModeText = mode;
    body.append(sentence, example, mode);
    preview.append(body);
    return preview;
  }

  private handleThemeKeydown(event: KeyboardEvent): void {
    const currentIndex = this.themeButtons.findIndex(
      (button) => button.dataset.theme === this.selectedTheme
    );
    if (currentIndex < 0) {
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
    const nextTheme = this.normalizeTheme(this.themeButtons[nextIndex]?.dataset.theme);
    this.updateThemeSelection(nextTheme);
    this.themeButtons[nextIndex]?.focus();
    this.markDirty();
  }

  private updateThemeSelection(theme: ReaderHighlightTheme): void {
    this.selectedTheme = this.normalizeTheme(theme);
    this.themeButtons.forEach((button) => {
      const isSelected = button.dataset.theme === this.selectedTheme;
      button.classList.toggle('is-active', isSelected);
      button.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      button.tabIndex = isSelected ? 0 : -1;
    });
    this.updatePreview();
  }

  private updatePreview(): void {
    if (this.previewHighlight) {
      this.previewHighlight.style.background = THEME_STYLE[this.selectedTheme];
    }
    if (this.previewModeText) {
      const mode = this.normalizeExportMode(this.exportModeSelect?.value);
      this.previewModeText.textContent = `${this.resolveExportModeLabel(mode)} · ${this.resolveThemeLabel(this.selectedTheme)}`;
    }
  }

  private resolveExportModeLabel(mode: ReadingExportMode): string {
    return mode === 'full'
      ? (this.props.messages?.readingExportModeFull ?? '保存全文并标注高亮')
      : (this.props.messages?.readingExportModeHighlights ?? '仅保存高亮片段');
  }

  private resolveThemeLabel(theme: ReaderHighlightTheme): string {
    switch (theme) {
      case 'purple':
        return this.props.messages?.readingHighlightThemePurple ?? '纯紫色';
      case 'neonYellow':
        return this.props.messages?.readingHighlightThemeNeonYellow ?? '荧光黄';
      case 'neonGreen':
        return this.props.messages?.readingHighlightThemeNeonGreen ?? '荧光绿';
      case 'neonOrange':
        return this.props.messages?.readingHighlightThemeNeonOrange ?? '荧光橙';
      case 'gradient':
      default:
        return this.props.messages?.readingHighlightThemeGradient ?? '渐变紫蓝（默认）';
    }
  }

  private normalizeExportMode(value: unknown): ReadingExportMode {
    return EXPORT_MODES.includes(value as ReadingExportMode)
      ? (value as ReadingExportMode)
      : 'highlights';
  }

  private normalizeTheme(value: unknown): ReaderHighlightTheme {
    return HIGHLIGHT_THEMES.includes(value as ReaderHighlightTheme)
      ? (value as ReaderHighlightTheme)
      : 'gradient';
  }

  private markDirty(): void {
    notifyWidgetDirty(this.runtime, ['readingSession']);
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo =
      this.optionsRepository?.onChange((options) => {
        this.applySnapshot(options);
      }) ?? null;
  }
}
