import { resolveRepository } from '../shared/di/serviceRegistry';
import { DI_TOKENS } from '../shared/di/tokens';
import type { IOptionsRepository } from '../shared/repositories/IOptionsRepository';
import type { InterfaceTheme } from '../shared/types/options';

export async function applyStoredOnboardingTheme(): Promise<void> {
  try {
    const optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
    const options = await optionsRepository.get();
    applyOnboardingTheme(options.interfaceTheme);
  } catch {
    applyOnboardingTheme(resolveStoredThemePreference());
  }
}

function applyOnboardingTheme(preference: InterfaceTheme | undefined): void {
  const resolvedTheme = resolvePreviewTheme(preference);
  document.documentElement.dataset.previewTheme = resolvedTheme;
  document.documentElement.dataset.theme = resolvedTheme;
  document.body.dataset.previewTheme = resolvedTheme;
}

function resolvePreviewTheme(preference: InterfaceTheme | undefined): 'dark' | 'light' {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }
  return resolveSystemTheme();
}

function resolveStoredThemePreference(): InterfaceTheme {
  try {
    const stored = window.localStorage.getItem('aob-theme');
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage can be unavailable in isolated test contexts.
  }
  return 'system';
}

function resolveSystemTheme(): 'dark' | 'light' {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}
