import type { CompleteOptions } from '../../shared/types/options';
import type { SectionInvalidationScope } from '../../ui/stitch-runtime/render/sectionInvalidation';
import { optionsPathKey, type OptionsPath } from '../state/optionsPatchModel';
import type { OptionsController } from './optionsController';
import type { MountedProductionStitchShell } from './productionStitchShellTypes';

const ROOT_SCOPES: Record<OptionsPath[0], SectionInvalidationScope> = {
  interfaceTheme: 'theme',
  rest: 'storage',
  templates: 'output',
  domainMappings: 'output',
  aiChat: 'output',
  deepResearch: 'capture-sources',
  fragmentClipper: 'capture-behavior',
  readingSession: 'capture-behavior',
  video: 'capture-sources',
  classifier: 'capture-sources',
  experimentalAi: 'capture-sources',
  pageSummary: 'capture-sources',
  readingOverlaySummary: 'capture-sources',
  subtitleTranslation: 'capture-sources',
  privacyPreferences: 'overview-usage',
  vaultRouter: 'storage',
  yamlConfig: 'output'
};

export function resolveAuthoritativeRebaseScopes(
  changedPaths: readonly OptionsPath[],
  dirtyPathKeys: readonly string[] = []
): SectionInvalidationScope[] {
  const scopes = new Set<SectionInvalidationScope>();
  changedPaths.forEach((path) => scopes.add(ROOT_SCOPES[path[0]]));
  if (dirtyPathKeys.includes(optionsPathKey(['yamlConfig']))) scopes.delete('output');
  return [...scopes];
}

export function applyProductionStitchAuthoritativeRebase(
  owners: {
    resetOptions(options: CompleteOptions): void;
    afterReset?(): void;
    render(scopes: readonly SectionInvalidationScope[]): void;
  },
  nextDraft: CompleteOptions,
  transition: {
    changedPaths: readonly OptionsPath[];
    dirtyPathKeys: readonly string[];
  }
): void {
  owners.resetOptions(nextDraft);
  owners.afterReset?.();
  const scopes = resolveAuthoritativeRebaseScopes(
    transition.changedPaths,
    transition.dirtyPathKeys
  );
  if (scopes.length > 0) owners.render(scopes);
}

export function createProductionStitchAuthoritativeRebase(owners: {
  resetOptions(options: CompleteOptions): void;
  afterReset?(): void;
  render(scopes: readonly SectionInvalidationScope[]): void;
}): (
  nextDraft: CompleteOptions,
  transition: { changedPaths: readonly OptionsPath[]; dirtyPathKeys: readonly string[] }
) => void {
  return (nextDraft, transition) =>
    applyProductionStitchAuthoritativeRebase(owners, nextDraft, transition);
}

export function bindProductionStitchAuthoritativeRebase(
  controller: Pick<OptionsController, 'bindMountedDraftRebase'>,
  mounted: Pick<MountedProductionStitchShell, 'rebaseOptions'>
): () => void {
  if (
    typeof controller.bindMountedDraftRebase !== 'function' ||
    typeof mounted.rebaseOptions !== 'function'
  ) {
    return () => undefined;
  }
  return controller.bindMountedDraftRebase((options, transition) => {
    mounted.rebaseOptions(options, transition);
  });
}
