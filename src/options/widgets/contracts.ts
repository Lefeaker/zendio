import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { Messages } from '@i18n';

export type OptionsSnapshotLike = StoredOptions | CompleteOptions | null | undefined;

export interface WidgetRuntime {
  notifyDirty?: (keys?: string[], meta?: { invalid?: boolean }) => void;
  reportError?: (scope: string, error: unknown) => void;
}

export interface WidgetMountContract<
  TProps,
  TCollectResult = unknown,
  TSnapshot = OptionsSnapshotLike
> {
  mount(container: HTMLElement, props: TProps, runtime?: WidgetRuntime): void | Promise<void>;
  update(props: TProps, runtime?: WidgetRuntime): void | Promise<void>;
  destroy(): void;
  collect?(): TCollectResult;
  applySnapshot?(snapshot: TSnapshot): void | Promise<void>;
}

export interface BaseWidgetProps {
  messages?: Messages | null;
}

export function notifyDirty(runtime: WidgetRuntime | undefined, keys: string[]): void {
  runtime?.notifyDirty?.(keys);
}

export function reportWidgetError(
  runtime: WidgetRuntime | undefined,
  scope: string,
  error: unknown
): void {
  runtime?.reportError?.(scope, error);
  if (!runtime?.reportError) {
    console.error(`[${scope}] Widget error:`, error);
  }
}
