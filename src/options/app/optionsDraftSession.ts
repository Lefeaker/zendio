import type { CompleteOptions } from '../../shared/types/options';
import { decodeStoredOptions } from '../../shared/config/storedOptionsCodec';
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

const valuesEqual = areStateValuesEqual,
  readPath = readOptionsPath,
  pathKey = optionsPathKey;
type StateValue = Parameters<typeof valuesEqual>[0];

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
    return OPTIONS_PATCH_PATHS.map(pathKey).filter((key) => this.dirty.has(key));
  }
  captureLocalDraft(nextDraft: CompleteOptions): OptionsDraftSessionTransition {
    const previousDirtyKeys = this.getDirtyPathKeys();
    const changedPaths = diffOptionsPaths(this.working, nextDraft);
    this.admissionGeneration += 1;
    for (const path of changedPaths) {
      const key = pathKey(path);
      const nextValue = readPath(nextDraft, path);
      const authoritativeValue = readPath(this.authoritative, path);
      if (
        valuesEqual(nextValue, authoritativeValue) &&
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
    this.authorityRevisions.stampExternal(authoritativeChangedPaths, this.revision, (path) =>
      [...this.admitted.values()].some((ownedPaths) =>
        ownedPaths.some(
          (owned) =>
            pathKey(owned.path) === pathKey(path) &&
            valuesEqual(owned.value, readPath(nextSnapshot, path))
        )
      )
    );
    this.reconcileDirtyWithAuthoritative();
    this.working = this.composeWorkingDraft();
    const changedPaths = diffOptionsPaths(previousWorking, this.working);
    return this.transition(changedPaths, previousDirtyKeys);
  }
  createIntent(): OptionsMutationIntent | null {
    const owned = OPTIONS_PATCH_PATHS.flatMap((path) => {
      const current = this.dirty.get(pathKey(path));
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
    snapshot: CompleteOptions
  ): OptionsDraftSessionTransition {
    const before = this.working;
    const dirtyBefore = this.getDirtyPathKeys();
    this.admitted.delete(intent.intentId);
    let next = deepClone(this.authoritative);

    for (const { path, value, editGeneration, authorityRevision } of intent.owned) {
      const ack = readPath(snapshot, path);
      if (!valuesEqual(ack, value)) {
        if (path.length !== 1 || path[0] !== 'vaultRouter') continue;
        const decoded = decodeStoredOptions({ vaultRouter: value });
        if (
          !decoded.automaticWritebackIsLossless ||
          decoded.canonical.vaultRouter === undefined ||
          !valuesEqual(ack, decoded.runtime.vaultRouter)
        )
          continue;
      }
      const owner = this.dirty.get(pathKey(path));
      if (owner?.editGeneration === editGeneration && valuesEqual(owner.value, value)) {
        this.dirty.delete(pathKey(path));
      }
      if (!this.authorityRevisions.canInstall(path, authorityRevision, this.revision)) continue;
      if (!valuesEqual(readPath(next, path), ack)) {
        next = replaceOptionsPath(next, path, ack);
      }
    }

    if (!areOptionsSnapshotsEqual(this.authoritative, next)) {
      this.authoritative = next;
      this.revision += 1;
    }
    this.working = this.composeWorkingDraft();
    const changedPaths = diffOptionsPaths(before, this.working);
    return this.transition(changedPaths, dirtyBefore);
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
        (owned) => pathKey(owned.path) === key && !valuesEqual(owned.value, authoritativeValue)
      )
    );
  }

  private reconcileDirtyWithAuthoritative(): void {
    for (const [key, owned] of this.dirty) {
      const authoritativeValue = readPath(this.authoritative, owned.path);
      if (
        valuesEqual(owned.value, authoritativeValue) &&
        !this.admittedValueWillChangeBase(key, authoritativeValue)
      )
        this.dirty.delete(key);
    }
  }

  private composeWorkingDraft(): CompleteOptions {
    let composed = deepClone(this.authoritative);
    for (const path of OPTIONS_PATCH_PATHS) {
      const owned = this.dirty.get(pathKey(path));
      if (owned) composed = replaceOptionsPath(composed, path, owned.value);
    }
    return composed;
  }
}

export function createOptionsDraftSession(initial: CompleteOptions): OptionsDraftSession {
  return new OptionsDraftSession(initial);
}
