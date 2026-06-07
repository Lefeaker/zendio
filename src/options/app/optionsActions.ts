import type { Language } from '@i18n';
import type { OptionsStateManager } from '../state/StateManager';

interface OptionsActionsDependencies {
  stateManager: OptionsStateManager | null;
  changeLanguage(language: Language): Promise<Language>;
  copyConfig(): Promise<void>;
  importConfig(): Promise<void>;
  saveOptions(): Promise<void>;
  runDiagnostics(): Promise<void>;
  fixConfiguration(): Promise<void>;
  reloadDiagnostics(): Promise<void>;
}

let dependencies: OptionsActionsDependencies | null = null;

export function configureOptionsActions(deps: OptionsActionsDependencies): void {
  dependencies = deps;
}

function ensureDependencies(): OptionsActionsDependencies {
  if (!dependencies) {
    throw new Error('[optionsActions] Actions have not been configured.');
  }
  return dependencies;
}

export async function changeLanguage(language: Language): Promise<void> {
  const deps = ensureDependencies();
  const resolved = await deps.changeLanguage(language);
  deps.stateManager?.setState({ language: resolved });
}

export async function copyConfig(): Promise<void> {
  const deps = ensureDependencies();
  await deps.copyConfig();
}

export async function importConfig(): Promise<void> {
  const deps = ensureDependencies();
  await deps.importConfig();
}

export async function saveOptions(): Promise<void> {
  const deps = ensureDependencies();
  await deps.saveOptions();
}

export async function runDiagnostics(): Promise<void> {
  const deps = ensureDependencies();
  await deps.runDiagnostics();
}

export async function fixConfiguration(): Promise<void> {
  const deps = ensureDependencies();
  await deps.fixConfiguration();
}

export async function reloadDiagnostics(): Promise<void> {
  const deps = ensureDependencies();
  await deps.reloadDiagnostics();
}
