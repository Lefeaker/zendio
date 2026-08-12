import { BaseComponent } from '../../foundation/lifecycle/BaseComponent';

export type CardVariant = 'normal' | 'compact' | 'side';

export interface CardProps {
  variant?: CardVariant;
  title?: string;
  image?: {
    src: string;
    alt?: string;
  };
  body: HTMLElement | string;
  actions?: HTMLElement[];
}

export interface PrimitiveCardElementProps {
  title?: string | undefined;
  description?: string | undefined;
  actions?: HTMLElement[];
  body: Node;
  className?: string;
}

const CARD_VARIANT_CLASS: Record<CardVariant, string> = {
  normal: 'card',
  compact: 'card-compact',
  side: 'card-side'
};

export function createCardElement({
  title,
  description,
  actions = [],
  body,
  className = 'card'
}: PrimitiveCardElementProps): HTMLElement {
  const card = document.createElement('section');
  card.className = className;
  if (title || description || actions.length) {
    const header = document.createElement('div');
    header.className = 'card-header';
    const copy = document.createElement('div');
    if (title) {
      const heading = document.createElement('h2');
      heading.textContent = title;
      copy.append(heading);
    }
    if (description) {
      const paragraph = document.createElement('p');
      paragraph.textContent = description;
      copy.append(paragraph);
    }
    header.append(copy);
    if (actions.length) {
      const toolbar = document.createElement('div');
      toolbar.className = 'toolbar';
      toolbar.append(...actions);
      header.append(toolbar);
    }
    card.append(header);
  }
  card.append(body);
  return card;
}

/**
 * DaisyUI card wrapper retained as a UI primitive after old shared entry removal.
 */
export class DaisyCard extends BaseComponent<CardProps> {
  render(props: CardProps): HTMLDivElement {
    this.assertActive();

    const card = this.createElement('div', this.composeRootClass(props.variant));

    const figure = this.createImageFigure(props);
    if (figure) {
      card.append(figure);
    }

    const body = this.createElement('div', 'card-body');
    this.injectTitle(body, props.title);
    this.injectBody(body, props.body);
    this.injectActions(body, props.actions);

    card.append(body);
    this.container.replaceChildren(card);
    return card;
  }

  private composeRootClass(variant: CardVariant | undefined): string {
    const classList = ['card', 'bg-base-100', 'shadow-xl', CARD_VARIANT_CLASS[variant ?? 'normal']];
    return classList.filter(Boolean).join(' ').trim();
  }

  private createImageFigure(props: CardProps): HTMLElement | null {
    if (!props.image?.src) {
      return null;
    }
    const figure = this.createElement('figure');
    const img = this.createElement('img');
    img.src = props.image.src;
    img.alt = props.image.alt ?? props.title ?? 'Card image';
    figure.append(img);
    return figure;
  }

  private injectTitle(body: HTMLElement, title?: string): void {
    if (!title) {
      return;
    }
    const heading = this.createElement('h2', 'card-title');
    heading.textContent = title;
    body.append(heading);
  }

  private injectBody(body: HTMLElement, content: HTMLElement | string): void {
    if (typeof content === 'string') {
      const paragraph = this.createElement('p');
      paragraph.textContent = content;
      body.append(paragraph);
      return;
    }
    body.append(content);
  }

  private injectActions(body: HTMLElement, actions?: HTMLElement[]): void {
    if (!actions?.length) {
      return;
    }
    const actionsWrapper = this.createElement('div', 'card-actions justify-end');
    for (const action of actions) {
      actionsWrapper.append(action);
    }
    body.append(actionsWrapper);
  }
}
