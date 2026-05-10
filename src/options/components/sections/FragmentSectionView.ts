import type { CompleteOptions, FragmentClipperOptions, StoredOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import { configProvider } from '@shared/config';
import { getOptionsController, markPendingAutoSave } from '../../app/optionsControllerContext';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';
import {
  applyFragmentSectionSnapshot,
  collectFragmentSectionChanges,
  normalizeFragmentContextLength
} from './fragmentSectionState';
import {
  buildFragmentSectionBody,
  highlightFragmentShortcutControl,
  type FragmentSectionLayoutRefs,
  updateContextControlsVisibility,
  updateModifierGroupVisibility
} from './fragmentSectionLayout';
import {
  createEmptyFragmentLayoutRefs,
  resolveFragmentModifierLabel
} from './fragmentSectionViewHelpers';
import {
  bindFragmentSectionEvents,
  createFragmentSectionBindings,
  type EventBinding
} from './fragmentSectionBindings';

const FRAGMENT_DEFAULTS = configProvider.getFragmentClipperDefaults();
const MODIFIER_KEYS: Array<FragmentClipperOptions['selectionModifierKeys'][number]> = [
  'alt',
  'meta',
  'ctrl',
  'shift'
];
const CONTEXT_MODES: Array<FragmentClipperOptions['contextMode']> = ['chars', 'sentences'];

export class FragmentSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private refs: FragmentSectionLayoutRefs = createEmptyFragmentLayoutRefs();
  private highlightCleanup: (() => void) | null = null;
  private eventBindings: EventBinding[] = [];
  private unsubscribeRepo: (() => void) | null = null;

  constructor(container: HTMLElement, optionsRepo: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo;
  }

  protected renderWithState(_context: SectionRenderContext): HTMLElement {
    this.disposeListeners();
    this.applySectionChrome();

    const header = this.buildHeader();
    const body = this.buildBody();

    this.container.replaceChildren(header, body);
    this.bindEvents();
    this.registerFormIntegration();
    this.subscribeToRepository();
    return this.container;
  }

  override destroy(): void {
    this.disposeHighlight();
    this.disposeListeners();
    this.unregisterManagedFormSection();
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    super.destroy();
  }

  highlightKeyboardShortcuts = (): boolean => {
    this.disposeHighlight();
    return highlightFragmentShortcutControl(this.refs, (cleanup) => {
      this.highlightCleanup = cleanup;
    });
  };

  private registerFormIntegration(): void {
    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    };
    this.registerManagedFormSection('fragmentClipper', binding);
  }

  private buildHeader(): HTMLElement {
    return this.buildSectionHeader({
      title: this.messages?.fragmentConfigTitle ?? '片段剪藏配置',
      description: this.messages?.fragmentConfigHint ?? '自定义选中文本剪藏的格式和行为',
      titleClassName: 'm-0 text-2xl font-semibold tracking-tight',
      descriptionClassName: 'text-base-content/60 text-md'
    });
  }

  private buildBody(): HTMLElement {
    const { body, refs } = buildFragmentSectionBody({
      createElement: (tag, className) => this.createElement(tag, className),
      createSectionBody: () => this.createSectionBody(),
      createSectionSettings: () => this.createSectionSettings(),
      messages: this.messages,
      defaults: FRAGMENT_DEFAULTS,
      modifierKeys: MODIFIER_KEYS,
      contextModes: CONTEXT_MODES,
      resolveModifierLabel: (key) =>
        resolveFragmentModifierLabel({
          key,
          messages: this.messages as Record<string, string | undefined> | null | undefined
        })
    });
    this.refs = refs;
    return body;
  }

  private bindEvents(): void {
    this.eventBindings = bindFragmentSectionEvents({
      refs: this.refs,
      onValueChanged: this.handleValueChanged,
      onCaptureContextChange: this.handleCaptureContextChange,
      onModifierToggleChange: this.handleModifierToggleChange,
      onContextLengthChange: this.handleContextLengthChange,
      onContextLengthBlur: this.handleContextLengthBlur
    });
  }

  private disposeListeners(): void {
    this.eventBindings.forEach(({ target, type, handler }) => {
      target.removeEventListener(type, handler);
    });
    this.eventBindings = [];
    this.refs = createEmptyFragmentLayoutRefs();
  }

  private disposeHighlight(): void {
    if (this.highlightCleanup) {
      this.highlightCleanup();
      this.highlightCleanup = null;
    }
  }

  private handleValueChanged = (): void => {
    markPendingAutoSave('fragmentClipper');
    const controller = getOptionsController();
    controller?.scheduleAutoSave();
  };

  private handleCaptureContextChange = (): void => {
    updateContextControlsVisibility(this.refs, Boolean(this.refs.captureContextCheckbox?.checked));
    this.handleValueChanged();
  };

  private handleModifierToggleChange = (): void => {
    updateModifierGroupVisibility(this.refs, Boolean(this.refs.modifierToggle?.checked));
    this.handleValueChanged();
  };

  private handleContextLengthChange = (): void => {
    this.normalizeContextLength();
    this.handleValueChanged();
  };

  private handleContextLengthBlur = (): void => {
    this.normalizeContextLength();
  };

  private normalizeContextLength(previous?: number): number {
    return normalizeFragmentContextLength(
      this.refs.contextLengthInput,
      previous ?? FRAGMENT_DEFAULTS.contextLength ?? 200
    );
  }

  private applySnapshot(options: StoredOptions): void {
    applyFragmentSectionSnapshot({
      bindings: createFragmentSectionBindings(this.refs),
      options,
      defaults: FRAGMENT_DEFAULTS,
      contextModes: CONTEXT_MODES
    });
    updateModifierGroupVisibility(this.refs, Boolean(this.refs.modifierToggle?.checked));
    updateContextControlsVisibility(this.refs, Boolean(this.refs.captureContextCheckbox?.checked));
  }

  private collectChanges(previous: StoredOptions | null): Partial<CompleteOptions> {
    return collectFragmentSectionChanges({
      bindings: createFragmentSectionBindings(this.refs),
      previous,
      defaults: FRAGMENT_DEFAULTS,
      contextModes: CONTEXT_MODES,
      modifierKeys: MODIFIER_KEYS
    });
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = this.optionsRepo.onChange((options) => {
      this.applySnapshot(options);
    });
  }
}
