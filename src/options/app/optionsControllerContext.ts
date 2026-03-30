import type { OptionsController } from './optionsController';

let controllerInstance: OptionsController | null = null;
let pendingAutoSaveSource: string | null = null;

export function registerOptionsController(instance: OptionsController): void {
  controllerInstance = instance;
}

export function resetOptionsController(): void {
  controllerInstance = null;
}

export function getOptionsController(): OptionsController | null {
  return controllerInstance;
}

export function markPendingAutoSave(source: string): void {
  pendingAutoSaveSource = source;
}

export function consumePendingAutoSaveSource(): string | null {
  const source = pendingAutoSaveSource;
  pendingAutoSaveSource = null;
  return source;
}
