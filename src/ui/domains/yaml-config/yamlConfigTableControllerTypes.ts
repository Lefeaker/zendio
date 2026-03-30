import type { YamlConfigOverrides } from '@shared/types/yamlConfig';

export interface YamlConfigControllerOptions {
  tableHost?: HTMLElement | null;
  domainHost?: HTMLElement | null;
  addFieldButton?: HTMLButtonElement | null;
  onDirty?: () => void;
}

export interface ControllerState {
  render(initial: YamlConfigOverrides | null): void;
  collect(): YamlConfigOverrides | null;
  dispose(): void;
}
