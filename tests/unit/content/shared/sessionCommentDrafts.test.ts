import { describe, expect, it, vi } from 'vitest';
import { SessionCommentDraftController } from '@content/shared/panels/sessionCommentDrafts';

function createController(
  overrides: {
    getRoot?: () => ParentNode | null;
    items?: Array<{ id: string; comment: string }>;
    onChange?: ReturnType<typeof vi.fn>;
    submitDraft?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const items = overrides.items ?? [{ id: 'capture-1', comment: 'Saved comment' }];
  const submitDraft = overrides.submitDraft ?? vi.fn(async () => undefined);
  const onChange = overrides.onChange ?? vi.fn();
  const controller = new SessionCommentDraftController({
    datasetKey: 'captureInput',
    inputSelector: '[data-capture-input]',
    getItems: () => items,
    getRoot: overrides.getRoot ?? (() => null),
    submitDraft,
    onChange
  });

  return { controller, items, onChange, submitDraft };
}

describe('SessionCommentDraftController', () => {
  it('snapshot captures rendered inputs before returning drafts', () => {
    const input = {
      dataset: { captureInput: 'capture-1' },
      value: 'Unsaved draft'
    } as unknown as HTMLInputElement;
    const { controller } = createController({
      getRoot: () =>
        ({
          querySelectorAll: () => [input]
        }) as unknown as ParentNode
    });

    expect(controller.snapshot()).toEqual({
      'capture-1': 'Unsaved draft'
    });
  });

  it('notifies with the current snapshot only when the draft value changes', () => {
    const { controller, onChange } = createController();

    controller.remember('capture-1', 'Draft note');
    controller.remember('capture-1', 'Draft note');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({
      'capture-1': 'Draft note'
    });
  });

  it('notifies when clear or flush removes drafts', async () => {
    const { controller, onChange, submitDraft } = createController();

    controller.remember('capture-1', 'Draft note');
    onChange.mockClear();
    controller.clear('capture-1');
    expect(onChange).toHaveBeenCalledWith({});

    controller.remember('capture-1', 'Another draft');
    onChange.mockClear();
    await controller.runAfterFlush(vi.fn(async () => undefined));

    expect(submitDraft).toHaveBeenCalledWith('capture-1', 'Another draft');
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it('flushes the starting draft snapshot even when submit side effects mutate the live store', async () => {
    const items = [
      { id: 'capture-1', comment: '' },
      { id: 'capture-6', comment: '' }
    ];
    let controller!: SessionCommentDraftController<(typeof items)[number]>;
    const submitDraft = vi.fn(async (id: string) => {
      if (id === 'capture-1') {
        controller.clear('capture-6');
      }
    });
    controller = new SessionCommentDraftController({
      datasetKey: 'captureInput',
      inputSelector: '[data-capture-input]',
      getItems: () => items,
      getRoot: () => null,
      submitDraft
    });

    controller.remember('capture-1', 'first draft');
    controller.remember('capture-6', 'sixth draft');
    await controller.runAfterFlush(vi.fn(async () => undefined));

    expect(submitDraft).toHaveBeenCalledWith('capture-1', 'first draft');
    expect(submitDraft).toHaveBeenCalledWith('capture-6', 'sixth draft');
  });

  it('does not clear a newer draft value written during async submit', async () => {
    const items = [{ id: 'capture-6', comment: '' }];
    let controller!: SessionCommentDraftController<(typeof items)[number]>;
    const submitDraft = vi.fn(async () => {
      controller.remember('capture-6', 'newer live draft');
    });
    controller = new SessionCommentDraftController({
      datasetKey: 'captureInput',
      inputSelector: '[data-capture-input]',
      getItems: () => items,
      getRoot: () => null,
      submitDraft
    });

    controller.remember('capture-6', 'submitted draft');
    await controller.runAfterFlush(vi.fn(async () => undefined));

    expect(submitDraft).toHaveBeenCalledWith('capture-6', 'submitted draft');
    expect(controller.snapshot()).toEqual({ 'capture-6': 'newer live draft' });
  });

  it('hydrate restores drafts without submitting or scheduling persistence', () => {
    const { controller, items, onChange, submitDraft } = createController();

    controller.hydrate({
      'capture-1': 'Restored draft'
    });

    expect(controller.withDraft(items[0]!)).toEqual({
      ...items[0]!,
      draft: 'Restored draft'
    });
    expect(submitDraft).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
