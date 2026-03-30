import type { YamlConfigOverrides } from '@shared/types/yamlConfig';
import { BaseComponent } from '../../foundation/lifecycle/BaseComponent';
import { createYamlConfigControllerState } from './yamlConfigTableControllerState';
import type {
  ControllerState,
  YamlConfigControllerOptions
} from './yamlConfigTableControllerTypes';
export type { YamlConfigControllerOptions } from './yamlConfigTableControllerTypes';

export class YamlConfigController extends BaseComponent<YamlConfigOverrides | null | undefined> {
  private controller: ControllerState;

  constructor(options: YamlConfigControllerOptions) {
    if (!options.tableHost) {
      throw new Error('[YamlConfigController] tableHost is required.');
    }
    super(options.tableHost);
    this.controller = createYamlConfigControllerState({
      tableHost: this.container,
      domainHost: options.domainHost ?? null,
      addFieldButton: options.addFieldButton ?? null,
      ...(options.onDirty !== undefined && { onDirty: options.onDirty })
    });
  }

  render(initial: YamlConfigOverrides | null | undefined = null): HTMLElement {
    this.assertActive();
    this.controller.render(initial ?? null);
    return this.container;
  }

  collect(): YamlConfigOverrides | null {
    this.assertActive();
    return this.controller.collect();
  }

  dispose(): void {
    this.destroy();
  }

  override destroy(): void {
    this.controller.dispose();
    super.destroy();
  }
}

export function createYamlConfigController(
  options: YamlConfigControllerOptions
): YamlConfigController {
  return new YamlConfigController(options);
}
