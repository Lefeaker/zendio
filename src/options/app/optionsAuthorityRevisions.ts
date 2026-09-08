import { OPTIONS_PATCH_PATHS, optionsPathKey, type OptionsPath } from '../state/optionsPatchModel';

export class OptionsAuthorityRevisions {
  private readonly revisions = new Map<string, number>();

  constructor(initialRevision: number) {
    this.reset(initialRevision);
  }

  reset(revision: number): void {
    OPTIONS_PATCH_PATHS.forEach((path) => this.revisions.set(optionsPathKey(path), revision));
  }

  stamp(paths: readonly OptionsPath[], revision: number): void {
    paths.forEach((path) => this.revisions.set(optionsPathKey(path), revision));
  }

  capture(path: OptionsPath, fallbackRevision: number): number {
    return this.revisions.get(optionsPathKey(path)) ?? fallbackRevision;
  }

  canInstall(path: OptionsPath, capturedRevision: number, fallbackRevision: number): boolean {
    return this.capture(path, fallbackRevision) <= capturedRevision;
  }
}
