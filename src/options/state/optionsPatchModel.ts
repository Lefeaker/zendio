import { isObjectRecord } from '../../shared/guards/object';
import { STORED_OPTIONS_DELETE } from '../../shared/config/storedOptionsCodec';
import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import type { OptionsPatch } from '../../shared/types/optionsMutationMessages';
import { areStateValuesEqual, cloneStateValue } from './stateValue';

type OptionsSnapshot = CompleteOptions | StoredOptions;
type StateValue = unknown;

function definePaths<const T extends readonly OptionsPatch['path'][]>(paths: T): T {
  return paths;
}

export const OPTIONS_PATCH_PATHS = definePaths([
  ['interfaceTheme'],
  ['rest', 'baseUrl'],
  ['rest', 'httpsUrl'],
  ['rest', 'httpUrl'],
  ['rest', 'vault'],
  ['rest', 'apiKey'],
  ['rest', 'localFolderId'],
  ['rest', 'localFolderName'],
  ['templates', 'article'],
  ['templates', 'video'],
  ['templates', 'fragment'],
  ['templates', 'reading'],
  ['templates', 'ai'],
  ['domainMappings'],
  ['aiChat', 'includeTimestamps'],
  ['aiChat', 'userName'],
  ['deepResearch', 'pureMode'],
  ['fragmentClipper', 'useFootnoteFormat'],
  ['fragmentClipper', 'captureContext'],
  ['fragmentClipper', 'contextLength'],
  ['fragmentClipper', 'contextMode'],
  ['fragmentClipper', 'selectionTriggerMode'],
  ['fragmentClipper', 'selectionModifierKeys'],
  ['fragmentClipper', 'keyboardShortcutsEnabled'],
  ['readingSession', 'exportMode'],
  ['readingSession', 'highlightTheme'],
  ['video', 'floatingPromptEnabled'],
  ['video', 'promptButtonLabel'],
  ['video', 'promptShortcut'],
  ['video', 'controlBarAutoPause'],
  ['video', 'controlBarScreenshot'],
  ['video', 'commentEditorAutoPause'],
  ['video', 'promptPosition'],
  ['video', 'screenshotAttachment'],
  ['classifier', 'enabled'],
  ['classifier', 'provider'],
  ['classifier', 'endpoint'],
  ['classifier', 'apiKey'],
  ['classifier', 'model'],
  ['classifier', 'timeoutMs'],
  ['classifier', 'taxonomy'],
  ['experimentalAi', 'provider'],
  ['experimentalAi', 'model'],
  ['experimentalAi', 'apiUrl'],
  ['experimentalAi', 'apiKey'],
  ['pageSummary', 'enabled'],
  ['readingOverlaySummary', 'enabled'],
  ['subtitleTranslation', 'enabled'],
  ['subtitleTranslation', 'targetLanguage'],
  ['privacyPreferences', 'analytics'],
  ['privacyPreferences', 'errorReporting'],
  ['privacyPreferences', 'debugMode'],
  ['vaultRouter'],
  ['yamlConfig']
]);

export type OptionsPath = (typeof OPTIONS_PATCH_PATHS)[number];

export function optionsPathKey(path: readonly string[]): string {
  return path.join('.');
}

export function readOptionsPath(
  value: OptionsSnapshot | null,
  path: readonly string[]
): StateValue {
  let current: StateValue = value;
  for (const part of path) {
    if (!isObjectRecord(current) || Array.isArray(current)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

export function createOptionsPatch(path: OptionsPath, value: StateValue): OptionsPatch {
  return {
    path,
    value: value === undefined ? STORED_OPTIONS_DELETE : cloneStateValue(value)
  } as OptionsPatch;
}

export function diffOptionsPaths(
  before: OptionsSnapshot | null,
  after: OptionsSnapshot
): OptionsPath[] {
  const changedPaths = OPTIONS_PATCH_PATHS.filter(
    (path) => !areStateValuesEqual(readOptionsPath(before, path), readOptionsPath(after, path))
  );
  if (before) {
    const projected = cloneStateValue(before);
    changedPaths.forEach((path) => {
      writeOptionsPath(projected, path, readOptionsPath(after, path));
    });
    if (!areStateValuesEqual(projected, after)) {
      throw new Error('UNREGISTERED_OPTIONS_DRAFT_PATH');
    }
  }
  return changedPaths;
}

function writeOptionsPath(snapshot: OptionsSnapshot, path: OptionsPath, value: StateValue): void {
  if (!isObjectRecord(snapshot)) return;
  let owner: Record<string, StateValue> = snapshot;
  const [root, field] = path;
  if (field !== undefined) {
    const child = owner[root];
    const nextOwner = isObjectRecord(child) && !Array.isArray(child) ? { ...child } : {};
    owner[root] = nextOwner;
    owner = nextOwner;
  }
  const leaf = field ?? root;
  if (value === undefined) delete owner[leaf];
  else owner[leaf] = cloneStateValue(value);
}

export function replaceOptionsPath<T extends OptionsSnapshot>(
  snapshot: T,
  path: OptionsPath,
  value: StateValue
): T {
  const next = cloneStateValue(snapshot);
  writeOptionsPath(next, path, value);
  return next;
}

export function areOptionsSnapshotsEqual(
  first: OptionsSnapshot | null,
  second: OptionsSnapshot | null
): boolean {
  return areStateValuesEqual(first, second);
}
