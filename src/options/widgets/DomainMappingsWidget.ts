import { DomainMappingsController } from '@options/components/controls/domainMappings';
import { createOptionsButtonElement } from '@ui/primitives/button';
import { DEFAULT_DOMAIN_MAPPINGS } from '@options/utils/defaults';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { WidgetMountContract, WidgetRuntime, BaseWidgetProps } from './contracts';
import { asOptionsSnapshot, createElement } from './utils';

export interface DomainMappingsWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class DomainMappingsWidget
  implements
    WidgetMountContract<
      DomainMappingsWidgetProps,
      Partial<CompleteOptions>,
      StoredOptions | CompleteOptions | null
    >
{
  private container: HTMLElement | null = null;
  private runtime: WidgetRuntime | undefined;
  private controller: DomainMappingsController | null = null;
  private listHost: HTMLElement | null = null;
  private addButton: HTMLButtonElement | null = null;

  mount(container: HTMLElement, props: DomainMappingsWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.runtime = runtime;
    this.render(props);
    this.controller = new DomainMappingsController(this.listHost ?? container);
    if (props.messages) {
      this.controller.setMessages(props.messages);
    }
    this.controller.render({
      maxEmptyRows: 3,
      onChange: () => this.runtime?.notifyDirty?.(['domainMappings'])
    });
    this.applySnapshot(props.options ?? null);
  }

  update(props: DomainMappingsWidgetProps, runtime?: WidgetRuntime): void {
    this.runtime = runtime ?? this.runtime;
    if (props.messages && this.controller) {
      this.controller.setMessages(props.messages);
    }
    this.updateCopy(props);
    this.applySnapshot(props.options ?? null);
  }

  destroy(): void {
    this.controller?.dispose();
    this.controller = null;
    this.listHost = null;
    this.addButton = null;
    this.container = null;
  }

  collect(): Partial<CompleteOptions> {
    return {
      domainMappings: this.controller?.collect() ?? {}
    };
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | null): void {
    const options = asOptionsSnapshot(snapshot);
    const mappings =
      options.domainMappings && Object.keys(options.domainMappings).length > 0
        ? { ...options.domainMappings }
        : { ...DEFAULT_DOMAIN_MAPPINGS };
    this.controller?.setMappings(mappings);
  }

  private render(props: DomainMappingsWidgetProps): void {
    if (!this.container) {
      return;
    }

    const root = createElement(
      'div',
      'schema-widget-stack schema-output-widget-shell schema-output-domain-shell'
    );
    const header = createElement('div', 'schema-card-header schema-output-widget-header');
    const copy = createElement('div');
    const title = createElement('h3');
    title.textContent = props.messages?.domainMappingTitle ?? 'Domain Mappings';
    const description = createElement('p');
    description.textContent =
      props.messages?.domainMappingHint ??
      'Map domains to readable folder aliases for cleaner output paths.';
    copy.append(title, description);

    this.addButton = createOptionsButtonElement({
      label: props.messages?.addMappingButton ?? '+ Add mapping',
      variant: 'primary',
      size: 'sm',
      className: 'schema-output-widget-action'
    });
    this.addButton.addEventListener('click', () => {
      this.controller?.addRow('', '', { autoFocus: true });
    });

    const toolbar = createElement('div', 'schema-output-toolbar');
    toolbar.append(this.addButton);

    const tableWrap = createElement('section', 'schema-table-wrap schema-output-domain-table-wrap');
    const table = createElement('div', 'schema-table schema-output-domain-table');
    const tableHeader = createElement('div', 'schema-output-domain-header');
    [
      props.messages?.schemaCommonFieldColumnLabel ?? 'Domain',
      props.messages?.schemaCommonValueColumnLabel ?? 'Folder Alias',
      props.messages?.yamlFieldActionsLabel ?? 'Actions'
    ].forEach((labelText) => {
      const cell = createElement('span');
      cell.textContent = labelText;
      tableHeader.append(cell);
    });
    this.listHost = createElement('div', 'schema-output-domain-list');
    table.append(tableHeader, this.listHost);
    tableWrap.append(table);

    header.append(copy);
    root.append(header, toolbar, tableWrap);
    this.container.replaceChildren(root);
  }

  private updateCopy(props: DomainMappingsWidgetProps): void {
    if (this.addButton) {
      this.addButton.textContent = props.messages?.addMappingButton ?? '+ Add mapping';
    }
  }
}
