import { createElement } from '../../utils/dom';
import {
  bindLocalizedText,
  bindLocalizedAttr,
  unbindLocalizedContent,
  type BoundElement,
  type LocalizedContent
} from '../../utils/localizedText';
import type { Messages } from '@i18n/locales';
import {
  queryAllFormControlElements,
  queryHTMLElement,
  queryFormControlElement
} from '@shared/guards';

export interface ListRowField {
  /** 字段名称，用于 CSS 类名和数据属性 */
  name: string;
  /** 输入类型 */
  type: 'text' | 'password' | 'number' | 'select';
  /** 占位符本地化配置 */
  placeholder?: {
    key: keyof Messages;
    fallback?: string;
  };
  /** 初始值 */
  value?: string;
  /** 输入框属性 */
  attributes?: Record<string, string>;
  /** 选择框选项（仅当 type 为 'select' 时使用） */
  options?: Array<{ value: string; text: string }>;
  /** 输入变化回调 */
  onChange?: (value: string, element: HTMLElement) => void;
}

export interface ListRowAction {
  /** 动作名称，用于 CSS 类名 */
  name: string;
  /** 按钮文本本地化配置 */
  text: {
    key: keyof Messages;
    fallback?: string;
  };
  /** 按钮 CSS 类名 */
  className?: string;
  /** 点击回调 */
  onClick: (rowElement: HTMLElement, actionElement: HTMLElement) => void;
}

export interface ListRowDescriptor {
  /** 行的唯一标识符 */
  id?: string;
  /** 输入字段配置 */
  fields: ListRowField[];
  /** 操作按钮配置 */
  actions: ListRowAction[];
  /** 行的 CSS 类名 */
  className?: string;
  /** 行的数据属性 */
  dataAttributes?: Record<string, string>;
}

export interface ListEditorConfig {
  /** 容器元素 ID 或元素本身 */
  container: string | HTMLElement;
  /** 容器附加类名 */
  containerClasses?: string[];
  /** 行描述符 */
  rows: ListRowDescriptor[];
  /** 删除行回调 */
  onRemove?: (rowElement: HTMLElement, rowId?: string) => void;
  /** 验证钩子 */
  validation?: (rowElement: HTMLElement) => { isValid: boolean; message?: string };
  /** 最大空行数限制 */
  maxEmptyRows?: number;
  /** 自动聚焦配置 */
  autoFocus?: {
    enabled: boolean;
    fieldName?: string; // 聚焦到指定字段，默认第一个字段
  };
  /** 高亮动画配置 */
  highlight?: {
    enabled: boolean;
    duration?: number; // 毫秒，默认 1200
  };
}

export interface ListEditor {
  /** 添加新行 */
  addRow(
    descriptor: ListRowDescriptor,
    options?: { autoFocus?: boolean; skipEmptyLimit?: boolean }
  ): HTMLElement;
  /** 移除行 */
  removeRow(rowElement: HTMLElement): void;
  /** 清理所有行 */
  clear(): void;
  /** 获取所有行元素 */
  getRows(): HTMLElement[];
  /** 销毁编辑器 */
  dispose(): void;
}

// 存储行绑定的 WeakMap
const rowBindings = new WeakMap<HTMLElement, BoundElement<HTMLElement>[]>();

/**
 * 创建列表编辑器
 */
export function createListEditor(config: ListEditorConfig): ListEditor {
  const resolvedContainer =
    typeof config.container === 'string'
      ? document.getElementById(config.container)
      : config.container;

  if (!resolvedContainer) {
    const containerLabel =
      typeof config.container === 'string'
        ? `#${config.container}`
        : config.container?.id
          ? `HTMLElement#${config.container.id}`
          : 'HTMLElement';
    throw new Error(`Container not found: ${containerLabel}`);
  }

  if (config.containerClasses?.length) {
    resolvedContainer.classList.add(...config.containerClasses);
  }
  const container: HTMLElement = resolvedContainer;

  const maxEmptyRows = config.maxEmptyRows ?? 3;
  const autoFocusEnabled = config.autoFocus?.enabled ?? true;
  const highlightEnabled = config.highlight?.enabled ?? true;
  const highlightDuration = config.highlight?.duration ?? 1200;

  function addRow(
    descriptor: ListRowDescriptor,
    options: { autoFocus?: boolean; skipEmptyLimit?: boolean } = {}
  ): HTMLElement {
    // 检查空行限制
    if (!options.skipEmptyLimit && maxEmptyRows > 0) {
      const emptyRows = getEmptyRows();
      if (emptyRows.length >= maxEmptyRows) {
        const target = emptyRows[0];
        if (target) {
          highlightRow(target);
          scrollToRow(target);
          focusFirstField(target, config.autoFocus?.fieldName);
        }
        return target;
      }
    }

    // 创建行元素
    const row = createElement('div');
    row.className = descriptor.className || 'list-row';

    if (descriptor.id) {
      row.dataset.id = descriptor.id;
    }

    // 设置数据属性
    if (descriptor.dataAttributes) {
      Object.entries(descriptor.dataAttributes).forEach(([key, value]) => {
        row.dataset[key] = value;
      });
    }

    // 创建字段
    const bindings: BoundElement<HTMLElement>[] = [];
    descriptor.fields.forEach((field) => {
      const fieldElement = createField(field, row);
      row.appendChild(fieldElement);

      // 绑定本地化内容
      if (field.placeholder) {
        bindings.push(
          bindLocalizedAttr(fieldElement, 'placeholder', toLocalizedContent(field.placeholder))
        );
      }
    });

    // 创建操作按钮
    descriptor.actions.forEach((action) => {
      const actionElement = createAction(action, row);
      row.appendChild(actionElement);

      // 绑定本地化文本
      bindings.push(bindLocalizedText(actionElement, toLocalizedContent(action.text)));
    });

    // 存储绑定
    rowBindings.set(row, bindings);

    // 添加到容器 (container is guaranteed to be non-null by the check at function start)
    container.appendChild(row);

    // 验证标记
    if (config.validation) {
      const validationResult = config.validation(row);
      row.dataset.valid = String(validationResult.isValid);
      if (validationResult.message) {
        row.dataset.validationMessage = validationResult.message;
      }
    }

    // 自动聚焦和高亮
    if (options.autoFocus && autoFocusEnabled) {
      window.requestAnimationFrame(() => {
        scrollToRow(row);
        focusFirstField(row, config.autoFocus?.fieldName);
        if (highlightEnabled) {
          highlightRow(row);
        }
      });
    }

    return row;
  }

  function removeRow(rowElement: HTMLElement): void {
    cleanupRowBindings(rowElement);
    rowElement.remove();
    if (config.onRemove) {
      config.onRemove(rowElement, rowElement.dataset.id);
    }
  }

  function clear(): void {
    const rows = Array.from(container.children) as HTMLElement[];
    rows.forEach((row) => {
      cleanupRowBindings(row);
    });
    container.innerHTML = '';
  }

  function getRows(): HTMLElement[] {
    return Array.from(container.children) as HTMLElement[];
  }

  function dispose(): void {
    clear();
  }

  // 辅助函数
  // 创建输入字段 (✅ Phase 1 DaisyUI migration: 使用 .input / .select 基类)
  function createField(field: ListRowField, row: HTMLElement): HTMLElement {
    let element: HTMLInputElement | HTMLSelectElement;

    if (field.type === 'select') {
      element = createElement('select');
      field.options?.forEach((option) => {
        const optionElement = createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        element.appendChild(optionElement);
      });
    } else {
      element = createElement('input');
      element.type = field.type;
    }

    // ✅ Phase 1: 使用 DaisyUI 语义类替代手动 utilities
    const classNames = [`field-${field.name}`];
    if (field.type === 'select') {
      classNames.push('select', 'select-bordered', 'w-full', 'min-h-[36px]');
    } else {
      classNames.push('input', 'input-bordered', 'w-full', 'min-h-[36px]');
    }

    const attributes = { ...(field.attributes ?? {}) };
    if (attributes.class) {
      classNames.push(attributes.class);
      delete attributes.class;
    }

    element.className = classNames.join(' ').trim();
    element.value = field.value || '';

    // 设置属性
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });

    // 绑定事件
    if (field.onChange) {
      const onChange = field.onChange;
      element.addEventListener('input', () => {
        onChange(element.value, row);
      });
    }

    return element;
  }

  // 创建操作按钮 (✅ Phase 1 DaisyUI migration: 使用 .btn 基类)
  function createAction(action: ListRowAction, row: HTMLElement): HTMLElement {
    const button = createElement('button');
    button.type = 'button';
    button.className = `btn aobx-btn action-${action.name}`;

    if (action.className) {
      button.classList.add(...action.className.split(' '));
    }

    button.addEventListener('click', () => {
      action.onClick(row, button);
    });

    return button;
  }

  function getEmptyRows(): HTMLElement[] {
    return getRows().filter((row) => {
      const inputs = queryAllFormControlElements(row, 'input, select');
      return inputs.every((input) => !input.value.trim());
    });
  }

  function highlightRow(row: HTMLElement): void {
    if (!highlightEnabled) return;

    row.classList.add('flash');
    window.setTimeout(() => {
      row.classList.remove('flash');
    }, highlightDuration);
  }

  function scrollToRow(row: HTMLElement): void {
    if (typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function focusFirstField(row: HTMLElement, fieldName?: string): void {
    let target: HTMLElement | null = null;

    if (fieldName) {
      target = queryHTMLElement(row, `.field-${fieldName}`);
    }

    if (!target) {
      target = queryFormControlElement(row, 'input, select');
    }

    target?.focus();
  }

  function cleanupRowBindings(row: HTMLElement): void {
    const bindings = rowBindings.get(row);
    if (bindings) {
      bindings.forEach(unbindLocalizedContent);
      rowBindings.delete(row);
    }
  }

  // 初始化现有行
  config.rows.forEach((descriptor) => {
    addRow(descriptor, { skipEmptyLimit: true });
  });

  return {
    addRow,
    removeRow,
    clear,
    getRows,
    dispose
  };
}

function toLocalizedContent(source: { key: keyof Messages; fallback?: string }): LocalizedContent {
  const content: LocalizedContent = { key: source.key };
  if (source.fallback !== undefined) {
    content.fallback = source.fallback;
  }
  return content;
}
