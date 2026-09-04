import type { CompleteOptions } from '../../shared/types/options';
import type { SectionInvalidationScope } from '../../ui/stitch-runtime/render/sectionInvalidation';
import { OPTIONS_PATCH_PATHS, optionsPathKey, type OptionsPath } from '../state/optionsPatchModel';
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
  changedPaths: readonly OptionsPath[]
): SectionInvalidationScope[] {
  const scopes = new Set<SectionInvalidationScope>();
  changedPaths.forEach((path) => scopes.add(ROOT_SCOPES[path[0]]));
  return [...scopes];
}

const PATH_SCOPES = new Map(
  OPTIONS_PATCH_PATHS.map((path) => [optionsPathKey(path), ROOT_SCOPES[path[0]]] as const)
);

interface AuthoritativeRebaseOwners {
  resetOptions(options: CompleteOptions): void;
  afterReset?(): void;
  getRenderProtectionKeys?(): readonly string[];
  reconcileRenderProtection?(persistentDirtyPathKeys: readonly string[]): void;
  render(scopes: readonly SectionInvalidationScope[]): void;
}

function resolveProtectedScopes(keys: readonly string[]): Set<SectionInvalidationScope> {
  return new Set(keys.flatMap((key) => (PATH_SCOPES.get(key) ? [PATH_SCOPES.get(key)!] : [])));
}

export function applyProductionStitchAuthoritativeRebase(
  owners: AuthoritativeRebaseOwners,
  nextDraft: CompleteOptions,
  transition: {
    changedPaths: readonly OptionsPath[];
    dirtyPathKeys: readonly string[];
  },
  deferredScopes: Set<SectionInvalidationScope> = new Set()
): void {
  owners.reconcileRenderProtection?.(transition.dirtyPathKeys);
  owners.resetOptions(nextDraft);
  owners.afterReset?.();
  const protectedScopes = resolveProtectedScopes(owners.getRenderProtectionKeys?.() ?? []);
  const toRender = new Set<SectionInvalidationScope>();
  resolveAuthoritativeRebaseScopes(transition.changedPaths).forEach((scope) => {
    if (protectedScopes.has(scope)) deferredScopes.add(scope);
    else toRender.add(scope);
  });
  deferredScopes.forEach((scope) => {
    if (!protectedScopes.has(scope)) {
      deferredScopes.delete(scope);
      toRender.add(scope);
    }
  });
  if (toRender.size > 0) owners.render([...toRender]);
}

export function createProductionStitchAuthoritativeRebase(
  owners: AuthoritativeRebaseOwners
): (
  nextDraft: CompleteOptions,
  transition: { changedPaths: readonly OptionsPath[]; dirtyPathKeys: readonly string[] }
) => void {
  const deferredScopes = new Set<SectionInvalidationScope>();
  return (nextDraft, transition) =>
    applyProductionStitchAuthoritativeRebase(owners, nextDraft, transition, deferredScopes);
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
