import type { PreviewStoreState } from '@options/stitch/types';
import type { StoredOptions } from '@shared/types/options';

type RuntimeTheme = PreviewStoreState['previewTheme'];

declare global {
  interface Window {
    __AI2OB_STITCH_RUNTIME_THEME__?: unknown;
  }
}

export function normalizeRuntimeTheme(value: unknown): RuntimeTheme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

export function resolveRuntimeThemeFromOptions(
  options: Partial<StoredOptions> | null | undefined
): RuntimeTheme | null {
  return normalizeRuntimeTheme(options?.interfaceTheme);
}

export function setControlledRuntimeTheme(targetWindow: Window, theme: unknown): RuntimeTheme {
  const normalized = normalizeRuntimeTheme(theme) ?? 'dark';
  targetWindow.__AI2OB_STITCH_RUNTIME_THEME__ = normalized;
  return normalized;
}

export function getControlledRuntimeTheme(targetWindow: Window = window): RuntimeTheme | null {
  return normalizeRuntimeTheme(targetWindow.__AI2OB_STITCH_RUNTIME_THEME__);
}
