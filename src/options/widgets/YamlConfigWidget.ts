import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { BaseWidgetProps, WidgetMountContract, WidgetRuntime } from './contracts';
import { YamlConfigWidgetController } from './yaml-config/controller';

export interface YamlConfigWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class YamlConfigWidget
  implements WidgetMountContract<YamlConfigWidgetProps, Partial<CompleteOptions>>
{
  private readonly controller = new YamlConfigWidgetController();

  mount(container: HTMLElement, props: YamlConfigWidgetProps, runtime?: WidgetRuntime): void {
    this.controller.mount(container, props, runtime);
  }

  update(props: YamlConfigWidgetProps, runtime?: WidgetRuntime): void {
    this.controller.update(props, runtime);
  }

  destroy(): void {
    this.controller.destroy();
  }

  collect(): Partial<CompleteOptions> {
    return this.controller.collect();
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | null | undefined): void {
    this.controller.applySnapshot(snapshot);
  }
}
