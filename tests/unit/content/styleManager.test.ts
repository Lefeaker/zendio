/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { InlineStyleManager } from '@content/clipper/shared/styleManager';

describe('InlineStyleManager', () => {
  it('mounts and unmounts style elements', () => {
    const manager = new InlineStyleManager(document);
    manager.mount('body { background: red; }');

    const style = document.head.querySelector('style');
    expect(style?.textContent).toContain('background: red');

    manager.unmount();
    expect(document.head.querySelector('style')).toBeNull();
  });
});
