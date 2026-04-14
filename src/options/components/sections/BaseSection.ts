import { BaseComponent } from '@ui/foundation/lifecycle/BaseComponent';
import type { OptionsStateManager } from '../../state/StateManager';
import type {
  FormSectionHandlers,
  FormSectionKey,
  FormSectionRegistry
} from '../formSections/formSectionManager';
import {
  applySectionChrome,
  createSectionBody,
  createSectionHeader,
  createSectionSettingRow,
  createSectionSettings
} from '@ui/patterns/section-shell';
import type { UiMountable } from '@ui/hosts/shared/contract';

export interface SectionRenderContext {
  stateManager: OptionsStateManager;
  formRegistry: FormSectionRegistry;
}

/**
 * Base class for state-driven options sections.
 */
export abstract class BaseSection<TContext extends SectionRenderContext = SectionRenderContext>
  extends BaseComponent<TContext>
  implements UiMountable<TContext>
{
  protected stateManager: OptionsStateManager | null = null;
  private formRegistry: FormSectionRegistry | null = null;
  private formSectionBinding: { key: FormSectionKey; handlers: FormSectionHandlers } | null = null;

  render(context: TContext): HTMLElement | void {
    this.assertActive();
    this.stateManager = context.stateManager;
    this.formRegistry = context.formRegistry;
    return this.renderWithState(context);
  }

  mount(context: TContext): HTMLElement | void {
    return this.render(context);
  }

  update(context: TContext): HTMLElement | void {
    return this.render(context);
  }

  destroy(): void {
    this.unregisterManagedFormSection();
    this.stateManager = null;
    this.formRegistry = null;
    super.destroy();
  }

  protected requireFormRegistry(): FormSectionRegistry {
    if (!this.formRegistry) {
      throw new Error(
        `[${this.constructor.name}] FormSectionRegistry is not available in the current context.`
      );
    }
    return this.formRegistry;
  }

  protected registerManagedFormSection(key: FormSectionKey, handlers: FormSectionHandlers): void {
    this.unregisterManagedFormSection();
    const registry = this.requireFormRegistry();
    registry.register(key, handlers);
    this.formSectionBinding = { key, handlers };
  }

  protected unregisterManagedFormSection(): void {
    if (!this.formSectionBinding || !this.formRegistry) {
      this.formSectionBinding = null;
      return;
    }

    this.formRegistry.unregister(this.formSectionBinding.key, this.formSectionBinding.handlers);
    this.formSectionBinding = null;
  }

  protected applySectionChrome(extraClasses: string[] = []): void {
    applySectionChrome(this.container, extraClasses);
  }

  protected buildSectionHeader(options: {
    title: string;
    description?: string;
    titleClassName?: string;
    descriptionClassName?: string;
    wrapperClassName?: string;
    titleWrapperClassName?: string;
    actions?: Node[];
  }): HTMLElement {
    return createSectionHeader(options);
  }

  protected createSectionBody(className = 'mt-6 space-y-6'): HTMLElement {
    return createSectionBody(className);
  }

  protected createSectionSettings(className = 'grid gap-6'): HTMLElement {
    return createSectionSettings(className);
  }

  protected createSettingRow(className?: string): HTMLElement {
    return createSectionSettingRow(className);
  }

  protected abstract renderWithState(context: TContext): HTMLElement | void;
}
