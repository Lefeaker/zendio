type VoidFn = () => void;

let classifierSync: VoidFn | null = null;
let aiTimestampEnforcer: VoidFn | null = null;
let fragmentShortcutsHighlighter: (() => boolean) | null = null;

interface PrivacyHandlers {
  refresh: () => Promise<void>;
  save: (options?: { showInlineStatus?: boolean }) => Promise<void>;
}

let privacyHandlers: PrivacyHandlers | null = null;

export function registerClassifierSync(sync: VoidFn): void {
  classifierSync = sync;
}

export function unregisterClassifierSync(sync: VoidFn): void {
  if (classifierSync === sync) {
    classifierSync = null;
  }
}

export function syncClassifierNote(): void {
  classifierSync?.();
}

export function registerAiTimestampEnforcer(enforce: VoidFn): void {
  aiTimestampEnforcer = enforce;
}

export function unregisterAiTimestampEnforcer(enforce: VoidFn): void {
  if (aiTimestampEnforcer === enforce) {
    aiTimestampEnforcer = null;
  }
}

export function enforceAiTimestampsDisabled(): void {
  aiTimestampEnforcer?.();
}

export function registerFragmentShortcutsHighlighter(handler: () => boolean): void {
  fragmentShortcutsHighlighter = handler;
}

export function unregisterFragmentShortcutsHighlighter(handler: () => boolean): void {
  if (fragmentShortcutsHighlighter === handler) {
    fragmentShortcutsHighlighter = null;
  }
}

export function highlightFragmentShortcuts(): boolean {
  return fragmentShortcutsHighlighter?.() ?? false;
}

export function registerPrivacyHandlers(handlers: PrivacyHandlers): void {
  privacyHandlers = handlers;
}

export function unregisterPrivacyHandlers(handlers: PrivacyHandlers): void {
  if (privacyHandlers === handlers) {
    privacyHandlers = null;
  }
}

export async function refreshPrivacySettings(): Promise<void> {
  await privacyHandlers?.refresh();
}

export async function savePrivacySettings(options?: { showInlineStatus?: boolean }): Promise<void> {
  await privacyHandlers?.save(options);
}
