import { describe, it, expect } from 'vitest';
import { withDomEnvironment } from '../../../utils/domEnvironment';
import { DaisyBadge } from '@options/components/shared/DaisyBadge';

const MARKUP = '<!DOCTYPE html><html><body></body></html>';

describe('DaisyBadge', () => {
  it('applies variant and size classes', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const badge = new DaisyBadge(document.body);
      const element = badge.render({ label: 'New', variant: 'primary', size: 'lg' });

      expect(element.className).toContain('badge');
      expect(element.className).toContain('badge-primary');
      expect(element.className).toContain('badge-lg');
    });
  });

  it('renders icon when provided', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const badge = new DaisyBadge(container);
      const element = badge.render({ label: 'Sync', iconName: 'Activity' });

      expect(element.querySelector('svg')).not.toBeNull();
    });
  });

  it('renders label text', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const badge = new DaisyBadge(document.body);
      const element = badge.render({ label: 'Beta' });

      expect(element.textContent).toContain('Beta');
    });
  });
});
