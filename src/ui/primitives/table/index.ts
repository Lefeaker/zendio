import { BaseComponent } from '../../foundation/lifecycle/BaseComponent';

export interface DaisyTableProps {
  minWidthClass?: string;
  header: HTMLElement;
  body: HTMLElement[];
}

/**
 * Lightweight table presenter retained as a UI primitive after old shared entry removal.
 */
export class DaisyTable extends BaseComponent<DaisyTableProps> {
  render(props: DaisyTableProps): HTMLDivElement {
    this.assertActive();

    const wrapper = this.createElement(
      'div',
      [
        'w-full',
        'overflow-auto',
        'rounded-lg',
        'border',
        'border-base-300',
        'bg-base-100',
        'shadow-sm'
      ].join(' ')
    );
    const table = this.createElement(
      'div',
      ['w-full', 'text-sm', props.minWidthClass ?? ''].filter(Boolean).join(' ')
    );
    table.append(props.header, ...props.body);
    wrapper.append(table);
    this.container.replaceChildren(wrapper);
    return wrapper;
  }
}
