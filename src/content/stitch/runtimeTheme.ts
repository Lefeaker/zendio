import type { PreviewStoreState } from '@options/stitch/types';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { InterfaceTheme, StoredOptions } from '@shared/types/options';

type RuntimeTheme = PreviewStoreState['previewTheme'];
type RuntimeThemePreference = InterfaceTheme;
type MatchMediaLike = Pick<Window, 'matchMedia'>;

declare global {
  interface Window {
    __AI2OB_STITCH_RUNTIME_THEME__?: unknown;
  }
}

const runtimeSurfaceRoots = new WeakMap<Window, Set<HTMLElement>>();

export function normalizeRuntimeTheme(value: unknown): RuntimeTheme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

export function normalizeRuntimeThemePreference(value: unknown): RuntimeThemePreference {
  return value === 'light' || value === 'system' ? value : 'dark';
}

function getSurfaceRoots(targetWindow: Window): Set<HTMLElement> {
  let roots = runtimeSurfaceRoots.get(targetWindow);
  if (!roots) {
    roots = new Set();
    runtimeSurfaceRoots.set(targetWindow, roots);
  }
  return roots;
}

function resolveSystemTheme(targetWindow: MatchMediaLike): RuntimeTheme {
  try {
    return targetWindow.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

function createThemeMediaQuery(
  targetWindow: MatchMediaLike
): Pick<MediaQueryList, 'addEventListener' | 'removeEventListener'> {
  try {
    return targetWindow.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return {
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    };
  }
}

export function resolveRuntimeThemePreference(
  preference: unknown,
  targetWindow: MatchMediaLike = window
): RuntimeTheme {
  const normalized = normalizeRuntimeThemePreference(preference);
  if (normalized === 'system') {
    return resolveSystemTheme(targetWindow);
  }
  return normalized;
}

export function resolveRuntimeThemeFromOptions(
  options: Partial<StoredOptions> | null | undefined,
  targetWindow: MatchMediaLike = window
): RuntimeTheme | null {
  if (!options?.interfaceTheme) {
    return null;
  }
  return resolveRuntimeThemePreference(options.interfaceTheme, targetWindow);
}

export function setControlledRuntimeTheme(targetWindow: Window, theme: unknown): RuntimeTheme {
  const normalized = normalizeRuntimeTheme(theme) ?? 'dark';
  targetWindow.__AI2OB_STITCH_RUNTIME_THEME__ = normalized;
  applyRuntimeThemeToRegisteredRoots(targetWindow, normalized);
  return normalized;
}

export function getControlledRuntimeTheme(targetWindow: Window = window): RuntimeTheme | null {
  return normalizeRuntimeTheme(targetWindow.__AI2OB_STITCH_RUNTIME_THEME__);
}

export function registerRuntimeSurfaceThemeRoot(
  root: HTMLElement,
  targetWindow: Window = window
): () => void {
  const roots = getSurfaceRoots(targetWindow);
  roots.add(root);
  const theme = getControlledRuntimeTheme(targetWindow);
  if (theme) {
    root.dataset.previewTheme = theme;
  }
  return () => {
    roots.delete(root);
  };
}

function applyRuntimeThemeToRegisteredRoots(targetWindow: Window, theme: RuntimeTheme): void {
  const roots = getSurfaceRoots(targetWindow);
  roots.forEach((root) => {
    if (!root.isConnected) {
      roots.delete(root);
      return;
    }
    root.dataset.previewTheme = theme;
  });
}

export function startRuntimeThemeSync(
  optionsRepository: Pick<IOptionsRepository, 'onChange'>,
  targetWindow: Window = window,
  mediaWindow: MatchMediaLike = targetWindow
): () => void {
  let preference: RuntimeThemePreference = 'dark';
  const mediaQuery = createThemeMediaQuery(mediaWindow);
  const applyPreference = (): void => {
    setControlledRuntimeTheme(targetWindow, resolveRuntimeThemePreference(preference, mediaWindow));
  };
  const stopOptionsSubscription = optionsRepository.onChange((options) => {
    preference = normalizeRuntimeThemePreference(options.interfaceTheme);
    applyPreference();
  });
  const handleSystemThemeChange = (): void => {
    if (preference === 'system') {
      applyPreference();
    }
  };
  mediaQuery.addEventListener?.('change', handleSystemThemeChange);

  return () => {
    stopOptionsSubscription();
    mediaQuery.removeEventListener?.('change', handleSystemThemeChange);
  };
}
