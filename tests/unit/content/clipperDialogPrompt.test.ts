/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClipperDialogPromptGateway } from '@content/clipper/presentation/clipperDialogPrompt';
import type {
  ClipPromptRequest,
  ClipPromptResponse
} from '@content/clipper/application/clipPromptGateway';
import type { ClipperDialogOptions } from '@content/clipper/components/dialog';

const { show, createDialog, resolveCoordinator } = vi.hoisted(() => {
  const show =
    vi.fn<(text: string, options: ClipperDialogOptions) => Promise<ClipPromptResponse>>();
  return { show, createDialog: vi.fn(() => ({ show })), resolveCoordinator: vi.fn() };
});
vi.mock('@content/clipper/components/dialogFactory', () => ({ createClipperDialog: createDialog }));
vi.mock('@content/runtime/popupCoordinatorAccess', () => ({
  resolveContentPopupCoordinator: resolveCoordinator
}));

describe('clipper dialog prompt gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCoordinator.mockReturnValue(null);
    show.mockResolvedValue({ action: 'cancel', comment: '' });
  });

  it.each([
    { optional: {}, expected: {} },
    {
      optional: { allowVideoMode: false, initialComment: '' },
      expected: { allowVideoMode: false, initialComment: '' }
    },
    {
      optional: { allowVideoMode: true, initialComment: 'note' },
      expected: { allowVideoMode: true, initialComment: 'note' }
    }
  ])('preserves optional field presence and values: $optional', async ({ optional, expected }) => {
    const request: ClipPromptRequest = {
      selectedText: 'Selected',
      allowReaderMode: true,
      readerModeBehavior: 'append',
      ...optional
    };
    const response: ClipPromptResponse = {
      action: 'clip',
      comment: 'note',
      destination: { kind: 'downloads' },
      destinationSelectionIsExplicit: true
    };
    show.mockResolvedValue(response);
    const result = await createClipperDialogPromptGateway().requestSelectionAction(request);
    expect(show).toHaveBeenCalledExactlyOnceWith('Selected', {
      allowReaderMode: true,
      readerModeBehavior: 'append',
      ...expected
    });
    expect(result).toBe(response);
  });

  it('reads options before coordinator resolution and selected text afterwards', async () => {
    const request: ClipPromptRequest = {
      selectedText: 'Before',
      allowReaderMode: true,
      readerModeBehavior: 'append',
      allowVideoMode: false,
      initialComment: ''
    };
    const coordinator = { register: vi.fn() };
    resolveCoordinator.mockImplementationOnce(() => {
      request.allowReaderMode = false;
      request.readerModeBehavior = 'start';
      request.allowVideoMode = true;
      request.initialComment = 'Changed';
      request.selectedText = 'After';
      return coordinator;
    });
    await createClipperDialogPromptGateway().requestSelectionAction(request);
    expect(show).toHaveBeenCalledExactlyOnceWith('After', {
      allowReaderMode: true,
      readerModeBehavior: 'append',
      allowVideoMode: false,
      initialComment: '',
      dialogRegistry: coordinator
    });
  });

  it('returns cancellation unchanged and propagates dialog rejection', async () => {
    const request: ClipPromptRequest = {
      selectedText: 'Selected',
      allowReaderMode: false,
      readerModeBehavior: 'start'
    };
    const gateway = createClipperDialogPromptGateway();
    const cancellation: ClipPromptResponse = { action: 'cancel', comment: '' };
    show.mockResolvedValueOnce(cancellation);
    expect(await gateway.requestSelectionAction(request)).toBe(cancellation);
    const failure = new Error('dialog failed');
    show.mockRejectedValueOnce(failure);
    await expect(gateway.requestSelectionAction(request)).rejects.toBe(failure);
    expect(createDialog).toHaveBeenCalledTimes(2);
    expect(show).toHaveBeenCalledTimes(2);
  });
});
