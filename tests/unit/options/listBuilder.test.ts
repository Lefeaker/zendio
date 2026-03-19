/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  createListEditor, 
  type ListRowDescriptor, 
  type ListEditorConfig 
} from '@options/components/shared/listBuilder';

describe('listBuilder', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    // 创建测试容器
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('createListEditor', () => {
    it('creates editor with empty container', () => {
      const config: ListEditorConfig = {
        container: container,
        rows: []
      };

      const editor = createListEditor(config);
      
      expect(editor).toBeDefined();
      expect(editor.getRows()).toHaveLength(0);
      
      editor.dispose();
    });

    it('throws error for invalid container', () => {
      const config: ListEditorConfig = {
        container: 'non-existent-container',
        rows: []
      };

      expect(() => createListEditor(config)).toThrow('Container not found');
    });

    it('initializes with existing rows', () => {
      const rows: ListRowDescriptor[] = [
        {
          id: 'row1',
          fields: [
            {
              name: 'domain',
              type: 'text',
              value: 'example.com',
              placeholder: {
                key: 'domainMappingDomainPlaceholder',
                fallback: '例如: mp.weixin.qq.com'
              }
            }
          ],
          actions: [
            {
              name: 'delete',
              text: {
                key: 'domainMappingDeleteButton',
                fallback: '删除'
              },
              className: 'danger',
              onClick: vi.fn()
            }
          ]
        }
      ];

      const config: ListEditorConfig = {
        container: container,
        rows: rows
      };

      const editor = createListEditor(config);
      
      expect(editor.getRows()).toHaveLength(1);
      
      const row = editor.getRows()[0];
      expect(row.dataset.id).toBe('row1');
      expect(row.querySelector('.field-domain')).toBeTruthy();
      expect(row.querySelector('.action-delete')).toBeTruthy();
      
      editor.dispose();
    });
  });

  describe('addRow', () => {
    it('adds new row with fields and actions', () => {
      const config: ListEditorConfig = {
        container: container,
        rows: []
      };

      const editor = createListEditor(config);
      
      const descriptor: ListRowDescriptor = {
        id: 'test-row',
        className: 'mapping-item',
        fields: [
          {
            name: 'domain',
            type: 'text',
            value: 'test.com',
            placeholder: {
              key: 'domainMappingDomainPlaceholder',
              fallback: '域名'
            }
          },
          {
            name: 'name',
            type: 'text',
            value: '测试',
            placeholder: {
              key: 'domainMappingNamePlaceholder',
              fallback: '名称'
            }
          }
        ],
        actions: [
          {
            name: 'delete',
            text: {
              key: 'domainMappingDeleteButton',
              fallback: '删除'
            },
            onClick: vi.fn()
          }
        ],
        dataAttributes: {
          testAttr: 'testValue'
        }
      };

      const row = editor.addRow(descriptor);
      
      expect(row.dataset.id).toBe('test-row');
      expect(row.className).toBe('mapping-item');
      expect(row.dataset.testAttr).toBe('testValue');
      
      const domainInput = row.querySelector<HTMLInputElement>('.field-domain');
      expect(domainInput).toBeTruthy();
      if (!domainInput) throw new Error('domain input missing');
      expect(domainInput.value).toBe('test.com');
      expect(domainInput.type).toBe('text');
      
      const nameInput = row.querySelector<HTMLInputElement>('.field-name');
      expect(nameInput).toBeTruthy();
      if (!nameInput) throw new Error('name input missing');
      expect(nameInput.value).toBe('测试');
      
      const deleteButton = row.querySelector<HTMLButtonElement>('.action-delete');
      expect(deleteButton).toBeTruthy();
      if (!deleteButton) throw new Error('delete button missing');
      expect(deleteButton.type).toBe('button');
      
      editor.dispose();
    });

    it('handles select field type', () => {
      const config: ListEditorConfig = {
        container: container,
        rows: []
      };

      const editor = createListEditor(config);
      
      const descriptor: ListRowDescriptor = {
        fields: [
          {
            name: 'type',
            type: 'select',
            value: 'option2',
            options: [
              { value: 'option1', text: '选项1' },
              { value: 'option2', text: '选项2' }
            ]
          }
        ],
        actions: []
      };

      const row = editor.addRow(descriptor);
      
      const select = row.querySelector<HTMLSelectElement>('.field-type');
      expect(select).toBeTruthy();
      if (!select) throw new Error('select field missing');
      expect(select.tagName).toBe('SELECT');
      expect(select.value).toBe('option2');
      expect(select.options).toHaveLength(2);
      expect(select.options[0].value).toBe('option1');
      expect(select.options[0].text).toBe('选项1');
      
      editor.dispose();
    });

    it('triggers onChange callback when field value changes', () => {
      const onChange = vi.fn();
      const config: ListEditorConfig = {
        container: container,
        rows: []
      };

      const editor = createListEditor(config);
      
      const descriptor: ListRowDescriptor = {
        fields: [
          {
            name: 'test',
            type: 'text',
            onChange: onChange
          }
        ],
        actions: []
      };

      const row = editor.addRow(descriptor);
      const input = row.querySelector<HTMLInputElement>('.field-test');
      if (!input) throw new Error('test input missing');
      
      input.value = 'new value';
      input.dispatchEvent(new Event('input'));
      
      expect(onChange).toHaveBeenCalledWith('new value', row);
      
      editor.dispose();
    });

    it('triggers onClick callback when action is clicked', () => {
      const onClick = vi.fn();
      const config: ListEditorConfig = {
        container: container,
        rows: []
      };

      const editor = createListEditor(config);
      
      const descriptor: ListRowDescriptor = {
        fields: [],
        actions: [
          {
            name: 'test',
            text: { key: 'domainMappingDeleteButton', fallback: '测试' },
            onClick: onClick
          }
        ]
      };

      const row = editor.addRow(descriptor);
      const button = row.querySelector<HTMLButtonElement>('.action-test');
      if (!button) throw new Error('action button missing');
      
      button.click();
      
      expect(onClick).toHaveBeenCalledWith(row, button);
      
      editor.dispose();
    });

    it('respects maxEmptyRows limit', () => {
      const config: ListEditorConfig = {
        container: container,
        rows: [],
        maxEmptyRows: 2
      };

      const editor = createListEditor(config);
      
      const descriptor: ListRowDescriptor = {
        fields: [
          {
            name: 'test',
            type: 'text'
          }
        ],
        actions: []
      };

      // 添加两个空行
      editor.addRow(descriptor);
      editor.addRow(descriptor);
      
      expect(editor.getRows()).toHaveLength(2);
      
      // 尝试添加第三个空行，应该聚焦到第一个空行而不是创建新行
      const thirdRow = editor.addRow(descriptor);
      
      expect(editor.getRows()).toHaveLength(2);
      expect(thirdRow).toBe(editor.getRows()[0]); // 返回第一个空行
      
      editor.dispose();
    });

    it('applies validation and sets data attributes', () => {
      const validation = vi.fn().mockReturnValue({
        isValid: false,
        message: 'Invalid input'
      });

      const config: ListEditorConfig = {
        container: container,
        rows: [],
        validation: validation
      };

      const editor = createListEditor(config);
      
      const descriptor: ListRowDescriptor = {
        fields: [
          {
            name: 'test',
            type: 'text'
          }
        ],
        actions: []
      };

      const row = editor.addRow(descriptor);
      
      expect(validation).toHaveBeenCalledWith(row);
      expect(row.dataset.valid).toBe('false');
      expect(row.dataset.validationMessage).toBe('Invalid input');
      
      editor.dispose();
    });
  });

  describe('removeRow', () => {
    it('removes row and calls onRemove callback', () => {
      const onRemove = vi.fn();
      const config: ListEditorConfig = {
        container: container,
        rows: [],
        onRemove: onRemove
      };

      const editor = createListEditor(config);
      
      const descriptor: ListRowDescriptor = {
        id: 'test-row',
        fields: [{ name: 'test', type: 'text' }],
        actions: []
      };

      const row = editor.addRow(descriptor);
      expect(editor.getRows()).toHaveLength(1);
      
      editor.removeRow(row);
      
      expect(editor.getRows()).toHaveLength(0);
      expect(onRemove).toHaveBeenCalledWith(row, 'test-row');
      
      editor.dispose();
    });
  });

  describe('clear', () => {
    it('removes all rows', () => {
      const config: ListEditorConfig = {
        container: container,
        rows: []
      };

      const editor = createListEditor(config);
      
      const descriptor: ListRowDescriptor = {
        fields: [{ name: 'test', type: 'text' }],
        actions: []
      };

      editor.addRow(descriptor);
      editor.addRow(descriptor);
      
      expect(editor.getRows()).toHaveLength(2);
      
      editor.clear();
      
      expect(editor.getRows()).toHaveLength(0);
      expect(container.innerHTML).toBe('');
      
      editor.dispose();
    });
  });

  describe('dispose', () => {
    it('cleans up all resources', () => {
      const config: ListEditorConfig = {
        container: container,
        rows: []
      };

      const editor = createListEditor(config);
      
      const descriptor: ListRowDescriptor = {
        fields: [{ name: 'test', type: 'text' }],
        actions: []
      };

      editor.addRow(descriptor);
      expect(editor.getRows()).toHaveLength(1);
      
      editor.dispose();
      
      expect(editor.getRows()).toHaveLength(0);
      expect(container.innerHTML).toBe('');
    });
  });
});
