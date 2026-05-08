/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { previewUi } from '@options/stitch/ui/components';

describe('Stitch UI components', () => {
  it('prevents mouse focus scrolling on action buttons while preserving click actions', () => {
    const onClick = vi.fn();
    const button = previewUi.Button('测试连接', { variant: 'primary', onClick });
    document.body.append(button);

    const pointerEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button.dispatchEvent(pointerEvent);
    button.click();

    expect(pointerEvent.defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
