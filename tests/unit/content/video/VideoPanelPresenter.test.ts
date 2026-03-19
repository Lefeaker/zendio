import { describe, expect, it, vi } from 'vitest';
import type { VideoPanelCapture } from '@content/video/application/videoPanelModel';
import type { VideoSessionView } from '@content/video/application/videoSessionView';
import { VideoPanelPresenter } from '@content/video/videoPanelPresenter';

function createView(): VideoSessionView & {
  updateCount: ReturnType<typeof vi.fn>;
  setCaptures: ReturnType<typeof vi.fn>;
  updateHint: ReturnType<typeof vi.fn>;
  updateTexts: ReturnType<typeof vi.fn>;
  beginEditingCapture: ReturnType<typeof vi.fn>;
  stopEditing: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  return {
    updateCount: vi.fn(),
    setCaptures: vi.fn(),
    updateHint: vi.fn(),
    updateTexts: vi.fn(),
    beginEditingCapture: vi.fn(),
    stopEditing: vi.fn(),
    destroy: vi.fn()
  };
}

describe('VideoPanelPresenter', () => {
  it('formats timestamp and fragment captures into view items', () => {
    const view = createView();
    const presenter = new VideoPanelPresenter(view);

    const count = presenter.render({
      timestamps: [{ id: 't1', kind: 'timestamp', timeSec: 3671, url: 'https://example.com?t=3671', comment: '  note  ', createdAt: 1 }],
      fragments: [{ id: 'f1', kind: 'fragment', selectedText: '  a very long fragment '.repeat(8), selectedHtml: '<p>x</p>', fragmentUrl: 'https://example.com#frag', comment: '', createdAt: 2 }]
    });

    const captures = view.setCaptures.mock.calls[0]?.[0] as VideoPanelCapture[] | undefined;

    expect(count).toBe(2);
    expect(view.updateCount).toHaveBeenCalledWith(2);
    expect(captures).toHaveLength(2);
    expect(captures?.[0]).toMatchObject({ id: 't1', kind: 'timestamp', timeLabel: '01:01:11', commentPreview: 'note' });
    expect(captures?.[1]).toMatchObject({ id: 'f1', kind: 'fragment', commentPreview: '' });
    expect(captures?.[1]?.fragmentLabel).toContain('a very long fragment');
  });

  it('updates texts through the view and uses empty label fallback for blank fragments', () => {
    const view = createView();
    const presenter = new VideoPanelPresenter(view);
    presenter.updateTexts({ title: 'x' } as never);
    presenter.render({ timestamps: [], fragments: [{ id: 'f2', kind: 'fragment', selectedText: '   ', selectedHtml: '', fragmentUrl: '', comment: ' ok ', createdAt: 3 }] });

    expect(view.updateTexts).toHaveBeenCalled();
    expect(view.setCaptures).toHaveBeenCalledWith([
      expect.objectContaining({ fragmentLabel: '[empty]', commentPreview: 'ok' })
    ]);
  });
});
