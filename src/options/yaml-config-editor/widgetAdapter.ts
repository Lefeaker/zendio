import { mergeOptions } from '@shared/config/optionsMerger';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';
import type { Messages } from '@i18n';
import type { WidgetMountContract, WidgetRuntime } from '@options/schema-runtime/contracts';
import { createYamlEditorState } from './state';
import { serializeYamlEditorState } from './serialize';
import { validateYamlEditorState } from './validation';
import { createYamlEditorLabels, type YamlEditorLabels } from './labels';
import type { YamlEditorState, YamlEditorValidation } from './types';
import {
  renderYamlConfigEditorView,
  renderYamlEditorValidation,
  type YamlEditorFilter
} from './view';

export interface YamlConfigEditorWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
  messages?: Messages | null;
}

export interface YamlConfigEditorCollectResult extends Partial<CompleteOptions> {
  yamlConfig: YamlConfigOverrides | null;
}

type YamlEditorRuntime = Pick<
  Partial<WidgetRuntime<unknown, unknown>>,
  'notifyDirty' | 'reportError'
>;

export class YamlConfigEditorWidgetAdapter implements WidgetMountContract<
  YamlConfigEditorWidgetProps,
  unknown,
  unknown
> {
  private container: HTMLElement | null = null;
  private runtime: YamlEditorRuntime | undefined;
  private state: YamlEditorState = createYamlEditorState(null);
  private validation: YamlEditorValidation | null = null;
  private labels: YamlEditorLabels = createYamlEditorLabels(null);
  private filter: YamlEditorFilter = 'all';
  private lastValidYamlConfig: YamlConfigOverrides | null = null;

  mount(
    container: HTMLElement,
    props: YamlConfigEditorWidgetProps,
    runtime?: YamlEditorRuntime
  ): void {
    this.container = container;
    this.runtime = runtime;
    this.labels = createYamlEditorLabels(props.messages ?? null);
    this.applySnapshot(props.options ?? null);
  }

  update(props: YamlConfigEditorWidgetProps, runtime?: YamlEditorRuntime): void {
    this.runtime = runtime ?? this.runtime;
    this.labels = createYamlEditorLabels(props.messages ?? null);
    this.applySnapshot(props.options ?? null);
  }

  destroy(): void {
    this.container?.replaceChildren();
    this.container = null;
  }

  collect(): YamlConfigEditorCollectResult {
    const validation = validateYamlEditorState(this.state);
    if (!validation.valid) {
      this.validation = validation;
      renderYamlEditorValidation(this.container, this.validation, this.labels);
      return { yamlConfig: this.lastValidYamlConfig };
    }

    this.validation = null;
    this.lastValidYamlConfig = serializeYamlEditorState(this.state);
    renderYamlEditorValidation(this.container, this.validation, this.labels);
    return { yamlConfig: this.lastValidYamlConfig };
  }

  applySnapshot(snapshot: unknown): void {
    const source =
      snapshot && typeof snapshot === 'object'
        ? (snapshot as StoredOptions | CompleteOptions)
        : null;
    const merged = mergeOptions(source) as CompleteOptions;
    this.state = createYamlEditorState(merged.yamlConfig ?? null);
    this.validation = null;
    this.lastValidYamlConfig = merged.yamlConfig ?? null;
    this.render();
  }

  private render(): void {
    if (!this.container) {
      return;
    }
    this.container.replaceChildren(
      renderYamlConfigEditorView({
        state: this.state,
        filter: this.filter,
        validation: this.validation,
        labels: this.labels,
        onChange: () => this.markDirty(),
        onRender: () => this.render(),
        onSetFilter: (filter) => {
          this.filter = filter;
          this.render();
        }
      })
    );
  }

  private markDirty(): void {
    const validation = validateYamlEditorState(this.state);
    const invalid = !validation.valid;
    this.validation = invalid ? validation : null;
    if (!invalid) {
      this.lastValidYamlConfig = serializeYamlEditorState(this.state);
    }
    renderYamlEditorValidation(this.container, this.validation, this.labels);
    this.runtime?.notifyDirty?.(['yamlConfig'], { invalid });
  }
}
