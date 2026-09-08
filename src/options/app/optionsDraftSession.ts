import type { CompleteOptions } from '../../shared/types/options';
import { deepClone } from '../utils/clone';
import {
  areOptionsSnapshotsEqual,
  createOptionsPatch,
  diffOptionsPaths,
  OPTIONS_PATCH_PATHS,
  optionsPathKey,
  readOptionsPath,
  replaceOptionsPath,
  type OptionsPath
} from '../state/optionsPatchModel';
import { areStateValuesEqual, cloneStateValue } from '../state/stateValue';
import { OptionsAuthorityRevisions } from './optionsAuthorityRevisions';
import type {
  DirtyPathOwnership,
  OptionsDraftSessionTransition,
  OptionsMutationIntent
} from './optionsDraftSessionTypes';
export type {
  DirtyPathOwnership,
  MountedDraftRebase,
  OptionsDraftSessionTransition,
  OptionsMutationIntent
} from './optionsDraftSessionTypes';

type StateValue = Parameters<typeof areStateValuesEqual>[0];

interface MutableDirtyPathOwnership {
  path: OptionsPath;
  editGeneration: number;
  value: StateValue;
}

export class OptionsDraftSession {
  private authoritative: CompleteOptions;
  private working: CompleteOptions;
  private revision = 1;
  private nextEditGeneration = 1;
  private nextIntentId = 1;
  private admissionGeneration = 0;
  private readonly dirty = new Map<string, MutableDirtyPathOwnership>();
  private readonly admitted = new Map<number, readonly DirtyPathOwnership[]>();
  private readonly authorityRevisions = new OptionsAuthorityRevisions(this.revision);

  constructor(initial: CompleteOptions) {
    this.authoritative = deepClone(initial);
    this.working = deepClone(initial);
  }

  getRevision(): number {
    return this.revision;
  }

  getAuthoritativeSnapshot(): CompleteOptions {
    return deepClone(this.authoritative);
  }

  getWorkingDraft(): CompleteOptions {
    return deepClone(this.working);
  }

  getDirtyPathKeys(): string[] {
    return OPTIONS_PATCH_PATHS.map(optionsPathKey).filter((key) => this.dirty.has(key));
  }

  captureLocalDraft(nextDraft: CompleteOptions): OptionsDraftSessionTransition {
    const previousDirtyKeys = this.getDirtyPathKeys();
    const changedPaths = diffOptionsPaths(this.working, nextDraft);
    this.admissionGeneration += 1;
    for (const path of changedPaths) {
      const key = optionsPathKey(path);
      const nextValue = readOptionsPath(nextDraft, path);
      const authoritativeValue = readOptionsPath(this.authoritative, path);
      if (
        areStateValuesEqual(nextValue, authoritativeValue) &&
        !this.admittedValueWillChangeBase(key, authoritativeValue)
      ) {
        this.dirty.delete(key);
      } else {
        this.dirty.set(key, {
          path,
          editGeneration: this.nextEditGeneration++,
          value: cloneStateValue(nextValue)
        });
      }
    }
    this.reconcileDirtyWithAuthoritative();
    this.working = this.composeWorkingDraft();
    return this.transition(changedPaths, previousDirtyKeys);
  }

  observeAuthoritative(nextSnapshot: CompleteOptions): OptionsDraftSessionTransition {
    if (areOptionsSnapshotsEqual(this.authoritative, nextSnapshot)) {
      return { changed: false, changedPaths: [], ownershipChanged: false };
    }
    const previousWorking = this.working;
    const previousDirtyKeys = this.getDirtyPathKeys();
    const authoritativeChangedPaths = diffOptionsPaths(this.authoritative, nextSnapshot);
    this.authoritative = deepClone(nextSnapshot);
    this.revision += 1;
    this.authorityRevisions.stamp(authoritativeChangedPaths, this.revision);
    this.reconcileDirtyWithAuthoritative();
    this.working = this.composeWorkingDraft();
    const changedPaths = diffOptionsPaths(previousWorking, this.working);
    return this.transition(changedPaths, previousDirtyKeys);
  }

  createIntent(): OptionsMutationIntent | null {
    const owned = OPTIONS_PATCH_PATHS.flatMap((path) => {
      const current = this.dirty.get(optionsPathKey(path));
      return current
        ? [
            {
              path: current.path,
              editGeneration: current.editGeneration,
              authorityRevision: this.authorityRevisions.capture(current.path, this.revision),
              value: cloneStateValue(current.value)
            }
          ]
        : [];
    });
    if (owned.length === 0) return null;
    return {
      intentId: this.nextIntentId++,
      baseRevision: this.revision,
      admissionGeneration: this.admissionGeneration,
      owned,
      patches: owned.map(({ path, value }) => createOptionsPatch(path, value))
    };
  }

  admit(intent: OptionsMutationIntent): void {
    this.admitted.set(
      intent.intentId,
      intent.owned.map((owned) => ({ ...owned }))
    );
  }

  acknowledge(
    intent: OptionsMutationIntent,
    acknowledgedSnapshot: CompleteOptions
  ): OptionsDraftSessionTransition {
    const previousWorking = this.working;
    const previousDirtyKeys = this.getDirtyPathKeys();
    this.admitted.delete(intent.intentId);
    let nextAuthoritative = deepClone(this.authoritative);
    const installedPaths: OptionsPath[] = [];

    for (const sent of intent.owned) {
      const acknowledgedValue = readOptionsPath(acknowledgedSnapshot, sent.path);
      if (!areStateValuesEqual(acknowledgedValue, sent.value)) continue;
      const current = this.dirty.get(optionsPathKey(sent.path));
      if (
        current?.editGeneration === sent.editGeneration &&
        areStateValuesEqual(current.value, sent.value)
      ) {
        this.dirty.delete(optionsPathKey(sent.path));
      }
      if (!this.authorityRevisions.canInstall(sent.path, sent.authorityRevision, this.revision))
        continue;
      if (!areStateValuesEqual(readOptionsPath(nextAuthoritative, sent.path), acknowledgedValue)) {
        nextAuthoritative = replaceOptionsPath(nextAuthoritative, sent.path, acknowledgedValue);
        installedPaths.push(sent.path);
      }
    }

    if (!areOptionsSnapshotsEqual(this.authoritative, nextAuthoritative)) {
      this.authoritative = nextAuthoritative;
      this.revision += 1;
      this.authorityRevisions.stamp(installedPaths, this.revision);
    }
    this.working = this.composeWorkingDraft();
    const changedPaths = diffOptionsPaths(previousWorking, this.working);
    return this.transition(changedPaths, previousDirtyKeys);
  }

  fail(_intent: OptionsMutationIntent): void {
    this.admitted.delete(_intent.intentId);
    // Dirty ownership is intentionally retained for the existing bounded retry owner.
  }

  resetAuthoritative(nextSnapshot: CompleteOptions): OptionsDraftSessionTransition {
    const previousWorking = this.working;
    const previousDirtyKeys = this.getDirtyPathKeys();
    this.authoritative = deepClone(nextSnapshot);
    this.dirty.clear();
    this.admitted.clear();
    this.revision += 1;
    this.authorityRevisions.reset(this.revision);
    this.working = deepClone(nextSnapshot);
    const changedPaths = diffOptionsPaths(previousWorking, this.working);
    return this.transition(changedPaths, previousDirtyKeys);
  }

  private transition(
    changedPaths: readonly OptionsPath[],
    previousDirtyKeys: readonly string[]
  ): OptionsDraftSessionTransition {
    const currentDirtyKeys = this.getDirtyPathKeys();
    return {
      changed: changedPaths.length > 0,
      changedPaths,
      ownershipChanged:
        currentDirtyKeys.length !== previousDirtyKeys.length ||
        currentDirtyKeys.some((key, index) => key !== previousDirtyKeys[index])
    };
  }

  private admittedValueWillChangeBase(key: string, authoritativeValue: StateValue): boolean {
    return [...this.admitted.values()].some((ownedPaths) =>
      ownedPaths.some(
        (owned) =>
          optionsPathKey(owned.path) === key &&
          !areStateValuesEqual(owned.value, authoritativeValue)
      )
    );
  }

  private reconcileDirtyWithAuthoritative(): void {
    for (const [key, owned] of this.dirty) {
      const authoritativeValue = readOptionsPath(this.authoritative, owned.path);
      if (
        areStateValuesEqual(owned.value, authoritativeValue) &&
        !this.admittedValueWillChangeBase(key, authoritativeValue)
      )
        this.dirty.delete(key);
    }
  }

  private composeWorkingDraft(): CompleteOptions {
    let composed = deepClone(this.authoritative);
    for (const path of OPTIONS_PATCH_PATHS) {
      const owned = this.dirty.get(optionsPathKey(path));
      if (owned) composed = replaceOptionsPath(composed, path, owned.value);
    }
    return composed;
  }
}

export function createOptionsDraftSession(initial: CompleteOptions): OptionsDraftSession {
  return new OptionsDraftSession(initial);
}
