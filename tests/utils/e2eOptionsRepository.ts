import { vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../src/shared/config/defaultOptions';
import { mergeOptions } from '../../src/shared/config/optionsMerger';
import { repositoryContainer } from '../../src/shared/di/serviceRegistry';
import { DI_TOKENS } from '../../src/shared/di/tokens';
import type { IOptionsRepository } from '../../src/shared/repositories/IOptionsRepository';
import type { CompleteOptions, OptionsState } from '../../src/shared/types/options';

function completeOptions(state: OptionsState): CompleteOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...state,
    rest: state.rest,
    templates: state.templates,
    domainMappings: state.domainMappings,
    aiChat: state.aiChat ?? DEFAULT_OPTIONS.aiChat,
    deepResearch: state.deepResearch ?? DEFAULT_OPTIONS.deepResearch,
    fragmentClipper: state.fragmentClipper ?? DEFAULT_OPTIONS.fragmentClipper,
    readingSession: state.readingSession ?? DEFAULT_OPTIONS.readingSession,
    video: state.video ?? DEFAULT_OPTIONS.video,
    classifier: state.classifier ?? DEFAULT_OPTIONS.classifier,
    experimentalAi: state.experimentalAi ?? DEFAULT_OPTIONS.experimentalAi,
    pageSummary: state.pageSummary ?? DEFAULT_OPTIONS.pageSummary,
    readingOverlaySummary: state.readingOverlaySummary ?? DEFAULT_OPTIONS.readingOverlaySummary,
    subtitleTranslation: state.subtitleTranslation ?? DEFAULT_OPTIONS.subtitleTranslation
  };
}

export function createE2eOptionsRepository(
  overrides: Partial<CompleteOptions>
): IOptionsRepository {
  const options = completeOptions(mergeOptions(overrides));

  const repository: IOptionsRepository = {
    get: vi.fn<() => Promise<CompleteOptions>>(() => Promise.resolve(options)),
    set: vi.fn<(_nextOptions: Partial<CompleteOptions>) => Promise<void>>(() =>
      Promise.resolve(undefined)
    ),
    onChange: vi.fn<(callback: (options: CompleteOptions) => void) => () => void>((callback) => {
      callback(options);
      return () => undefined;
    })
  };

  repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, () => repository);
  return repository;
}
