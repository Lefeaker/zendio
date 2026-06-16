import { describe, expect, it } from 'vitest';
import { createTaskSuccessSurfaceContent } from '@content/stitch/runtimeSurfaceContent';

describe('runtimeSurfaceContent', () => {
  it('uses non-Chinese compatibility defaults for renderer labels', () => {
    const content = createTaskSuccessSurfaceContent();

    expect(content.rendererLabels).toEqual({
      resourcePendingBadge: 'Pending',
      resourceOpenAction: 'Open',
      highlightExamplePrefix: 'An exported example can look like ',
      highlightExampleText: 'highlighted text',
      highlightExampleSuffix: ' for easier review.'
    });
  });
});
