import { BaseComponent } from '../../../ui/foundation/lifecycle/BaseComponent';
import {
  createListEditor,
  type ListEditor,
  type ListRowDescriptor
} from '../infrastructure/listBuilder';
import { queryHTMLInputElement } from '@shared/guards';

export interface DomainMappingsRenderConfig {
  mappings?: Record<string, string>;
  maxEmptyRows?: number;
  onChange?: () => void;
}

export interface AddMappingRowOptions {
  autoFocus?: boolean;
  skipEmptyLimit?: boolean;
}

const DEFAULT_DOMAIN_PLACEHOLDER = '例如: mp.weixin.qq.com';
const DEFAULT_NAME_PLACEHOLDER = '例如: 公众号';
const DEFAULT_DELETE_LABEL = '删除';

/**
 * 可复用的域名映射编辑器组件。
 * 负责构建/销毁列表行，并向外暴露 add/collect 等接口。
 */
export class DomainMappingsController extends BaseComponent<DomainMappingsRenderConfig> {
  private editor: ListEditor | null = null;
  private onChange: (() => void) | undefined;
  private maxEmptyRows = 3;

  render(config: DomainMappingsRenderConfig = {}): HTMLElement {
    this.assertActive();
    this.onChange = config.onChange;
    this.maxEmptyRows = config.maxEmptyRows ?? 3;
    this.initializeEditor();
    if (config.mappings) {
      this.setMappings(config.mappings);
    }
    return this.container;
  }

  setMappings(mappings: Record<string, string>): void {
    this.assertActive();
    const editor = this.ensureEditor();
    editor.clear();
    Object.entries(mappings).forEach(([domain, name]) => {
      this.addRowInternal(domain, name, { skipEmptyLimit: true, autoFocus: false, notify: false });
    });
  }

  addRow(domain = '', name = '', options?: AddMappingRowOptions): void {
    this.assertActive();
    this.ensureEditor();
    this.addRowInternal(domain, name, { ...(options ?? {}), notify: true });
  }

  collect(): Record<string, string> {
    this.assertActive();
    const rows = this.ensureEditor().getRows();
    const result: Record<string, string> = {};

    rows.forEach((row) => {
      const domainInput = queryHTMLInputElement(row, '.field-domain');
      const nameInput = queryHTMLInputElement(row, '.field-name');
      const domain = domainInput?.value.trim();
      const name = nameInput?.value.trim();
      if (domain && name) {
        result[domain] = name;
      }
    });

    return result;
  }

  dispose(): void {
    this.destroy();
  }

  override destroy(): void {
    this.disposeEditor();
    super.destroy();
  }

  private initializeEditor(): void {
    this.disposeEditor();
    this.editor = createListEditor({
      container: this.container,
      containerClasses: ['grid', 'gap-2'],
      rows: [],
      maxEmptyRows: this.maxEmptyRows,
      autoFocus: { enabled: true, fieldName: 'domain' },
      highlight: { enabled: true, duration: 1200 },
      onRemove: () => this.notifyChange()
    });
  }

  private ensureEditor(): ListEditor {
    if (!this.editor) {
      this.initializeEditor();
    }
    if (!this.editor) {
      throw new Error('[DomainMappingsController] Failed to initialize editor');
    }
    return this.editor;
  }

  private disposeEditor(): void {
    this.editor?.dispose();
    this.editor = null;
  }

  private addRowInternal(
    domain: string,
    name: string,
    options: AddMappingRowOptions & { notify: boolean }
  ): void {
    const editor = this.ensureEditor();
    const descriptor: ListRowDescriptor = {
      className: 'mapping-item',
      fields: [
        {
          name: 'domain',
          type: 'text',
          value: domain,
          placeholder: {
            key: 'domainMappingDomainPlaceholder',
            fallback: this.messages?.domainMappingDomainPlaceholder ?? DEFAULT_DOMAIN_PLACEHOLDER
          },
          onChange: () => this.notifyChange()
        },
        {
          name: 'name',
          type: 'text',
          value: name,
          placeholder: {
            key: 'domainMappingNamePlaceholder',
            fallback: this.messages?.domainMappingNamePlaceholder ?? DEFAULT_NAME_PLACEHOLDER
          },
          onChange: () => this.notifyChange()
        }
      ],
      actions: [
        {
          name: 'delete',
          text: {
            key: 'domainMappingDeleteButton',
            fallback: this.messages?.domainMappingDeleteButton ?? DEFAULT_DELETE_LABEL
          },
          className:
            'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-9 px-4 py-2',
          onClick: (rowElement) => {
            this.editor?.removeRow(rowElement);
            this.notifyChange();
          }
        }
      ]
    };

    const addRowOptions: { autoFocus?: boolean; skipEmptyLimit?: boolean } = {};
    if (options.autoFocus !== undefined) {
      addRowOptions.autoFocus = options.autoFocus;
    }
    if (options.skipEmptyLimit !== undefined) {
      addRowOptions.skipEmptyLimit = options.skipEmptyLimit;
    }

    editor.addRow(descriptor, addRowOptions);
    if (options.notify) {
      this.notifyChange();
    }
  }

  private notifyChange(): void {
    this.onChange?.();
  }
}
