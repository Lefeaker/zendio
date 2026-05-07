import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import { persistPrivacyConsentAction } from '@options/app/actions';
import { PrivacySettings, type PrivacyConsentSnapshot } from '@ui/domains/privacy';
import type { WidgetMountContract, WidgetRuntime, BaseWidgetProps } from './contracts';
import { asOptionsSnapshot } from './utils';

export interface PrivacyWidgetDependencies {
  optionsRepository: IOptionsRepository;
}

export interface PrivacyWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class PrivacyWidget
  implements
    WidgetMountContract<
      PrivacyWidgetProps,
      Partial<CompleteOptions>,
      StoredOptions | CompleteOptions | null
    >
{
  private readonly deps: PrivacyWidgetDependencies;
  private container: HTMLElement | null = null;
  private runtime: WidgetRuntime | undefined;
  private props: PrivacyWidgetProps = {};
  private instance: PrivacySettings | null = null;
  private unsubscribeRepo: (() => void) | null = null;
  private cachedConsent: PrivacyConsentSnapshot | null = null;

  constructor(dependencies: PrivacyWidgetDependencies) {
    this.deps = dependencies;
  }

  mount(container: HTMLElement, props: PrivacyWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.props = props;
    this.runtime = runtime;
    this.cachedConsent = this.extractConsentSnapshot(props.options);
    this.render();
    this.subscribeToRepository();
  }

  update(props: PrivacyWidgetProps, runtime?: WidgetRuntime): void {
    this.props = props;
    this.runtime = runtime ?? this.runtime;
    if (props.messages && this.instance) {
      this.instance.setMessages(props.messages);
      this.instance.render();
    }
    if (props.options) {
      this.applySnapshot(props.options);
    }
  }

  destroy(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    this.instance?.destroy();
    this.instance = null;
    this.container = null;
  }

  collect(): Partial<CompleteOptions> {
    return this.cachedConsent ? { privacyPreferences: this.cachedConsent } : {};
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | null): void {
    this.cachedConsent = this.extractConsentSnapshot(snapshot);
    if (this.cachedConsent) {
      this.instance?.applyConsentSnapshot(this.cachedConsent);
    }
  }

  private render(): void {
    if (!this.container) {
      return;
    }
    this.instance?.destroy();
    this.instance = new PrivacySettings(this.container, {
      ...(this.cachedConsent ? { initialConsent: this.cachedConsent } : {}),
      onConsentChange: (snapshot) => {
        this.cachedConsent = snapshot;
        void this.persistConsent(snapshot);
      }
    });
    if (this.props.messages) {
      this.instance.setMessages(this.props.messages);
    }
    this.instance.render();
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = this.deps.optionsRepository.onChange((options) => {
      const snapshot = this.extractConsentSnapshot(options);
      if (!snapshot) {
        return;
      }
      this.cachedConsent = snapshot;
      this.instance?.applyConsentSnapshot(snapshot);
    });
  }

  private extractConsentSnapshot(
    source: StoredOptions | CompleteOptions | null | undefined
  ): PrivacyConsentSnapshot | null {
    const options = asOptionsSnapshot(source);
    return (
      (options as Partial<{ privacyPreferences?: PrivacyConsentSnapshot }>).privacyPreferences ??
      null
    );
  }

  private async persistConsent(snapshot: PrivacyConsentSnapshot): Promise<void> {
    await persistPrivacyConsentAction(snapshot, {
      optionsRepository: this.deps.optionsRepository
    });
    this.runtime?.notifyDirty?.(['privacyPreferences']);
  }
}
