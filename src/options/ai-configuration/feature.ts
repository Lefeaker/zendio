import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n';
import type { CompleteOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import { OptionsMutationError } from '@shared/types/optionsMutationMessages';
import { optionsPatchPreconditionsMatch } from '@shared/config/optionsPatchPreconditions';
import { createOptionsPatch, readOptionsPath, type OptionsPath } from '../state/optionsPatchModel';
import { writeToClipboard } from '../services/configTransfer';
import { reviewAiConfiguration } from './parse';
import { createAiConfigPrompt } from './prompt';
import { createAiConfigView } from './view';
import { AiConfigInputError, type AiConfigReview } from './types';

export function createAiConfiguration(options: {
  repository: Pick<IOptionsRepository, 'get' | 'patch'>;
  getCurrent(): CompleteOptions;
  getMessages(): Messages | null;
  beforeApply(review: AiConfigReview): Promise<void>;
  isActive(): boolean;
  browser: string;
}) {
  let review: AiConfigReview | undefined;
  let undo: AiConfigReview | undefined;
  let busy = false;
  let feedback = '';
  let error = false;
  let repairFeedback = '';
  let view: ReturnType<typeof createAiConfigView> | undefined;
  let localeSource: Messages | null | undefined;
  let locale = DEFAULT_RUNTIME_MESSAGES;
  const messages = () => {
    const source = options.getMessages();
    if (source !== localeSource) {
      localeSource = source;
      locale = source ? { ...DEFAULT_RUNTIME_MESSAGES, ...source } : DEFAULT_RUNTIME_MESSAGES;
    }
    return locale;
  };
  const render = () =>
    view?.render(messages(), { review, busy, undo: Boolean(undo), feedback, error });
  function inspect() {
    if (!view || busy) return;
    error = false;
    review = undefined;
    feedback = '';
    if (view.input.value.trim()) {
      try {
        review = reviewAiConfiguration(view.input.value, options.getCurrent());
        feedback = review.rows.length
          ? messages().aiConfigReview.replace('{count}', String(review.rows.length))
          : messages().aiConfigNoChanges;
      } catch (failure) {
        error = true;
        feedback =
          failure instanceof AiConfigInputError
            ? messages()[failure.key].replace('{field}', failure.field)
            : messages().aiConfigInvalidFormat;
      }
    }
    repairFeedback = error ? feedback : '';
    render();
  }
  function updatePrompt() {
    if (view)
      view.prompt.value = createAiConfigPrompt(
        messages(),
        options.browser,
        view.include.checked ? options.getCurrent() : undefined
      );
  }
  async function copy() {
    updatePrompt();
    try {
      await writeToClipboard(view?.prompt.value ?? '');
      feedback = messages().aiConfigCopied;
      error = false;
    } catch {
      feedback = messages().aiConfigCopyFailed;
      error = true;
      if (view) {
        view.promptDetails.open = true;
        view.prompt.focus();
        view.prompt.select();
      }
    }
    if (options.isActive()) render();
  }
  async function commit(isUndo: boolean) {
    const intent = isUndo ? undo : review;
    if (!intent?.patches.length || busy) return;
    busy = true;
    error = false;
    feedback = messages().aiConfigApplying;
    render();
    try {
      await options.beforeApply(intent);
      if (!options.isActive()) return;
      const current = await options.repository.get();
      if (!options.isActive()) return;
      if (!optionsPatchPreconditionsMatch(current, intent.expected))
        throw new OptionsMutationError('EXTERNAL_SYNC_CONFLICT');
      const saved = await options.repository.patch(intent.patches, intent.expected);
      if (!options.isActive()) return;
      undo = isUndo
        ? undefined
        : {
            patches: intent.expected,
            // Review paths are registered catalog/collection paths; use acknowledged canonical values.
            expected: intent.patches.map(({ path }) =>
              createOptionsPatch(path as OptionsPath, readOptionsPath(saved, path))
            ),
            rows: intent.rows.map((row) => ({ ...row, before: row.after, after: row.before }))
          };
      review = undefined;
      feedback = isUndo
        ? messages().aiConfigUndone
        : messages().aiConfigApplied.replace('{count}', String(intent.rows.length));
    } catch (failure) {
      if (!options.isActive()) return;
      error = true;
      if (failure instanceof OptionsMutationError && failure.code === 'EXTERNAL_SYNC_CONFLICT') {
        feedback = messages().aiConfigConflict;
        review = undefined;
        if (isUndo) undo = undefined;
      } else
        feedback =
          failure instanceof AiConfigInputError
            ? messages()[failure.key]
            : messages().aiConfigSaveFailed;
      repairFeedback = feedback;
    } finally {
      busy = false;
      if (options.isActive()) render();
    }
  }
  async function copyError() {
    try {
      await writeToClipboard(messages().aiConfigRepairPrompt + '\n' + (repairFeedback || feedback));
      if (options.isActive()) {
        feedback = messages().aiConfigCopied;
        render();
      }
    } catch {
      if (options.isActive()) {
        feedback = messages().aiConfigCopyFailed;
        render();
      }
    }
  }
  return {
    mount(host: HTMLElement) {
      view ??= createAiConfigView({
        copy: () => {
          void copy();
        },
        input: inspect,
        refresh: inspect,
        apply: () => {
          void commit(false);
        },
        undo: () => {
          void commit(true);
        },
        copyError: () => {
          void copyError();
        },
        prompt: updatePrompt
      });
      host.append(view.root);
      render();
    }
  };
}
