import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { VideoPanelCapture } from '@content/video/application/videoPanelModel';
import type { VideoSessionView } from '@content/video/application/videoSessionView';
import { VideoPanelPresenter } from '@content/video/videoPanelPresenter';

function createView(): VideoSessionView & {
  updateCount: Mock<VideoSessionView['updateCount']>;
  setCaptures: Mock<VideoSessionView['setCaptures']>;
  updateHint: Mock<VideoSessionView['updateHint']>;
  updateTexts: Mock<VideoSessionView['updateTexts']>;
  beginEditingCapture: Mock<VideoSessionView['beginEditingCapture']>;
  stopEditing: Mock<VideoSessionView['stopEditing']>;
  destroy: Mock<VideoSessionView['destroy']>;
} {
  return {
    updateCount: vi.fn<VideoSessionView['updateCount']>(),
    setCaptures: vi.fn<VideoSessionView['setCaptures']>(),
    updateHint: vi.fn<VideoSessionView['updateHint']>(),
    updateTexts: vi.fn<VideoSessionView['updateTexts']>(),
    beginEditingCapture: vi.fn<VideoSessionView['beginEditingCapture']>(),
    stopEditing: vi.fn<VideoSessionView['stopEditing']>(),
    destroy: vi.fn<VideoSessionView['destroy']>()
  };
}

function getRenderedCaptures(view: ReturnType<typeof createView>): VideoPanelCapture[] | undefined {
  return view.setCaptures.mock.calls[0]?.[0];
}

describe('VideoPanelPresenter', () => {
  it('formats timestamp and fragment captures into view items', () => {
    const view = createView();
    const presenter = new VideoPanelPresenter(view);

    const count = presenter.render({
      timestamps: [
        {
          id: 't1',
          kind: 'timestamp',
          timeSec: 3671,
          url: 'https://example.com?t=3671',
          comment: '  note  ',
          createdAt: 1,
          screenshotRequested: true,
          screenshot: {
            id: 'shot-1',
            fileName: 'video-61m11s-screenshot.png',
            mimeType: 'image/jpeg',
            dataUrl: 'data:image/jpeg;base64,frame',
            capturedAt: 1
          }
        }
      ],
      fragments: [
        {
          id: 'f1',
          kind: 'fragment',
          selectedText: '  a very long fragment '.repeat(8),
          selectedHtml: '<p>x</p>',
          fragmentUrl: 'https://example.com#frag',
          comment: '',
          createdAt: 2
        }
      ]
    });

    const captures = getRenderedCaptures(view);

    expect(count).toBe(2);
    expect(view.updateCount).toHaveBeenCalledWith(2);
    expect(captures).toHaveLength(2);
    expect(captures?.[0]).toMatchObject({
      id: 't1',
      kind: 'timestamp',
      timeLabel: '01:01:11',
      commentPreview: 'note',
      hasScreenshot: true,
      screenshotState: 'on'
    });
    expect(captures?.[1]).toMatchObject({ id: 'f1', kind: 'fragment', commentPreview: '' });
    expect(captures?.[1]?.fragmentLabel).toContain('a very long fragment');
  });

  it('marks requested-only screenshots as pending instead of ready', () => {
    const view = createView();
    const presenter = new VideoPanelPresenter(view);

    presenter.render({
      timestamps: [
        {
          id: 'pending-shot',
          kind: 'timestamp',
          timeSec: 42,
          url: 'https://example.com?t=42',
          comment: '',
          createdAt: 1,
          screenshotRequested: true
        }
      ],
      fragments: []
    });

    const captures = getRenderedCaptures(view);

    expect(captures?.[0]).toMatchObject({
      id: 'pending-shot',
      hasScreenshot: false,
      screenshotState: 'pending'
    });
  });

  it('does not keep terminal screenshot preparation failures in the pending state', () => {
    const view = createView();
    const presenter = new VideoPanelPresenter(view);

    presenter.render({
      timestamps: [
        {
          id: 'failed-shot',
          kind: 'timestamp',
          timeSec: 42,
          url: 'https://example.com?t=42',
          comment: '',
          createdAt: 1,
          screenshotRequested: true,
          screenshotPreparationFailed: true
        }
      ],
      fragments: []
    });

    const captures = getRenderedCaptures(view);

    expect(captures?.[0]).toMatchObject({
      id: 'failed-shot',
      hasScreenshot: false,
      screenshotState: 'off'
    });
  });

  it('updates texts through the view and uses empty label fallback for blank fragments', () => {
    const view = createView();
    const presenter = new VideoPanelPresenter(view);
    presenter.updateTexts({ title: 'x' } as never);
    presenter.render({
      timestamps: [],
      fragments: [
        {
          id: 'f2',
          kind: 'fragment',
          selectedText: '   ',
          selectedHtml: '',
          fragmentUrl: '',
          comment: ' ok ',
          createdAt: 3
        }
      ]
    });

    expect(view.updateTexts).toHaveBeenCalled();
    expect(view.setCaptures).toHaveBeenCalledWith([
      expect.objectContaining({ fragmentLabel: '[empty]', commentPreview: 'ok' })
    ]);
  });
});
