import { BaseComponent } from '../shared/BaseComponent';
import type { OptionsStateManager } from '../../state/StateManager';
import type { FormSectionRegistry } from '../formSections/formSectionManager';

export interface SectionRenderContext {
  stateManager: OptionsStateManager;
  formRegistry: FormSectionRegistry;
}

/**
 * Base class for state-driven options sections.
 */
export abstract class BaseSection<TContext extends SectionRenderContext = SectionRenderContext> extends BaseComponent<TContext> {
  protected stateManager: OptionsStateManager | null = null;
  private formRegistry: FormSectionRegistry | null = null;

  render(context: TContext): HTMLElement | void {
    this.assertActive();
    this.stateManager = context.stateManager;
    this.formRegistry = context.formRegistry;
    return this.renderWithState(context);
  }

  destroy(): void {
    this.stateManager = null;
    this.formRegistry = null;
    super.destroy();
  }

  protected requireFormRegistry(): FormSectionRegistry {
    if (!this.formRegistry) {
      throw new Error(`[${this.constructor.name}] FormSectionRegistry is not available in the current context.`);
    }
    return this.formRegistry;
  }

  protected abstract renderWithState(context: TContext): HTMLElement | void;
}
