import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';
import type { IYamlRepository } from '@shared/repositories/IYamlRepository';
import type { YamlConfigView } from '@ui/domains/yaml-config';
import type { WidgetMountContract, WidgetRuntime, BaseWidgetProps } from './contracts';
import { asOptionsSnapshot } from './utils';

export interface YamlConfigWidgetDependencies {
  yamlRepository: IYamlRepository;
}

export interface YamlConfigWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class YamlConfigWidget
  implements
    WidgetMountContract<
      YamlConfigWidgetProps,
      Partial<CompleteOptions>,
      StoredOptions | CompleteOptions | YamlConfigOverrides | null
    >
{
  private readonly deps: YamlConfigWidgetDependencies;
  private container: HTMLElement | null = null;
  private runtime: WidgetRuntime | undefined;
  private props: YamlConfigWidgetProps = {};
  private viewHost: HTMLElement | null = null;
  private yamlView: YamlConfigView | null = null;
  private yamlViewModulePromise: Promise<typeof import('@ui/domains/yaml-config')> | null = null;
  private currentOverrides: YamlConfigOverrides | null = null;
  private lastRenderedSerialized: string | null = null;
  private unsubscribeYamlRepo: (() => void) | null = null;
  private suppressRepoRender = false;

  constructor(dependencies: YamlConfigWidgetDependencies) {
    this.deps = dependencies;
  }

  mount(container: HTMLElement, props: YamlConfigWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.props = props;
    this.runtime = runtime;
    this.render();
    this.ensureYamlSubscription();
    void this.initializeYamlView();
    if (props.options) {
      this.applySnapshot(props.options);
    } else {
      void this.bootstrapOverrides();
    }
  }

  update(props: YamlConfigWidgetProps, runtime?: WidgetRuntime): void {
    this.props = props;
    this.runtime = runtime ?? this.runtime;
    if (this.props.messages && this.yamlView) {
      this.yamlView.setMessages(this.props.messages);
    }
    if (this.props.options) {
      this.applySnapshot(this.props.options);
    } else {
      this.renderViewIfNeeded(this.currentOverrides);
    }
  }

  destroy(): void {
    this.unsubscribeYamlRepo?.();
    this.unsubscribeYamlRepo = null;
    this.yamlView?.destroy();
    this.yamlView = null;
    this.viewHost = null;
    this.container = null;
    this.lastRenderedSerialized = null;
  }

  collect(): Partial<CompleteOptions> {
    const overrides = this.yamlView?.collect() ?? null;
    this.currentOverrides = overrides;
    this.lastRenderedSerialized = JSON.stringify(overrides ?? null);
    return { yamlConfig: overrides };
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | YamlConfigOverrides | null): void {
    const overrides = this.extractOverrides(snapshot);
    this.currentOverrides = overrides;
    this.renderViewIfNeeded(overrides);
  }

  private render(): void {
    if (!this.container) {
      return;
    }
    const shell = document.createElement('div');
    shell.className = 'schema-widget-stack schema-output-widget-shell schema-output-yaml-shell';
    this.viewHost = document.createElement('div');
    this.viewHost.className = 'schema-output-yaml-view';
    this.viewHost.dataset.role = 'yaml-config-view-host';
    shell.append(this.viewHost);
    this.container.replaceChildren(shell);
  }

  private async initializeYamlView(): Promise<void> {
    if (!this.viewHost) {
      return;
    }
    const { YamlConfigView: ViewCtor } = await this.loadYamlViewModule();
    this.yamlView = new ViewCtor(this.viewHost);
    if (this.props.messages) {
      this.yamlView.setMessages(this.props.messages);
    }
    this.yamlView.render({
      overrides: this.currentOverrides,
      onDirty: () => {
        this.runtime?.notifyDirty?.(['yamlConfig']);
      }
    });
    this.renderViewIfNeeded(this.currentOverrides);
  }

  private loadYamlViewModule(): Promise<typeof import('@ui/domains/yaml-config')> {
    if (!this.yamlViewModulePromise) {
      this.yamlViewModulePromise = import('@ui/domains/yaml-config');
    }
    return this.yamlViewModulePromise;
  }

  private async bootstrapOverrides(): Promise<void> {
    try {
      const overrides = await this.deps.yamlRepository.getOverrides();
      this.currentOverrides = overrides;
      this.renderViewIfNeeded(overrides);
    } catch (error) {
      console.warn('[YamlConfigWidget] Failed to load overrides from repository:', error);
    }
  }

  private ensureYamlSubscription(): void {
    if (this.unsubscribeYamlRepo) {
      return;
    }
    this.unsubscribeYamlRepo = this.deps.yamlRepository.onChange((overrides) => {
      this.currentOverrides = overrides;
      if (this.suppressRepoRender) {
        return;
      }
      this.renderViewIfNeeded(overrides);
    });
  }

  private renderViewIfNeeded(overrides: YamlConfigOverrides | null): void {
    if (!this.yamlView) {
      return;
    }
    const serialized = JSON.stringify(overrides ?? null);
    if (serialized === this.lastRenderedSerialized) {
      return;
    }
    this.suppressRepoRender = true;
    this.yamlView.update(overrides);
    this.suppressRepoRender = false;
    this.lastRenderedSerialized = serialized;
  }

  private extractOverrides(
    snapshot: StoredOptions | CompleteOptions | YamlConfigOverrides | null
  ): YamlConfigOverrides | null {
    if (snapshot === null) {
      return null;
    }
    const candidate = snapshot as Record<string, unknown>;
    if ('yamlConfig' in candidate) {
      const options = asOptionsSnapshot(snapshot as StoredOptions | CompleteOptions);
      return options.yamlConfig ?? null;
    }
    return snapshot as YamlConfigOverrides;
  }
}
