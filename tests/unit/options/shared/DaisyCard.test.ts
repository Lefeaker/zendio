import { describe, it, expect } from 'vitest';
import { withDomEnvironment } from '../../../utils/domEnvironment';
import { DaisyCard } from '@options/components/shared/DaisyCard';

const MARKUP = '<!DOCTYPE html><html><body></body></html>';

describe('DaisyCard', () => {
  it('renders card with default classes', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const card = new DaisyCard(container);
      const element = card.render({ body: 'content' });

      expect(element.className).toContain('card');
      expect(element.className).toContain('bg-base-100');
    });
  });

  it('renders title and text body', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const card = new DaisyCard(container);
      const element = card.render({ title: 'Hello', body: 'World' });

      expect(element.querySelector('.card-title')?.textContent).toBe('Hello');
      expect(element.querySelector('p')?.textContent).toBe('World');
    });
  });

  it('renders image when provided', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const card = new DaisyCard(container);
      const element = card.render({
        title: 'Image card',
        body: 'content',
        image: { src: '/image.png', alt: 'Alt text' }
      });

      const img = element.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.src).toContain('/image.png');
      expect(img?.alt).toBe('Alt text');
    });
  });

  it('renders actions', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const container = document.createElement('div');
      document.body.append(container);

      const action = document.createElement('button');
      action.textContent = 'Act';
      const card = new DaisyCard(container);
      const element = card.render({
        body: 'Body',
        actions: [action]
      });

      const actions = element.querySelector('.card-actions');
      expect(actions?.children.length).toBe(1);
      expect(actions?.textContent).toContain('Act');
    });
  });

  it('applies variant classes', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const card = new DaisyCard(document.body);
      const element = card.render({ variant: 'compact', body: 'text' });

      expect(element.className).toContain('card-compact');
    });
  });
});
