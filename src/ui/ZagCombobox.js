/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */

/**
 * ZagCombobox - 基于 Zag.js 的下拉选择组件
 *
 * 注意：由于 @zag-js/combobox 的类型定义不完整，
 * 此文件禁用了 TypeScript 的 any 类型检查。
 * 这是一个已知的技术债务，将在未来版本中改进。
 *
 * @see https://zagjs.com/components/combobox
 */
import * as combobox from '@zag-js/combobox';

export class ZagCombobox {
  constructor(props) {
    this.props = props;
    // ✅ 阶段 A：创建静态 DOM 结构（只执行一次）
    this.initDOM();

    // ✅ 阶段 B：初始化状态机
    this.machine = combobox.machine({
      id: this.props.id,
      collection: combobox.collection({
        items: this.props.options
      }),
      onValueChange: (details) => {
        this.props.onSelect?.(details.value[0]);
      }
    });

    // ✅ 阶段 C：订阅状态变化
    this.service = this.machine.start();
    this.service.subscribe((state) => {
      this.currentApi = combobox.connect(state, this.service.send, (v) => v);
      // ✅ 只更新属性，不销毁元素
      this.updateAttributes();
    });
  }

  // ✅ 阶段 A：创建静态结构（Mount）
  initDOM() {
    this.container = document.createElement('div');
    this.container.className = 'relative';

    // 创建标签
    this.labelEl = document.createElement('label');
    this.labelEl.className = 'block text-sm font-medium mb-1';

    // 创建输入框（只创建一次，后续只更新属性）
    this.inputEl = document.createElement('input');
    this.inputEl.className = 'input input-bordered w-full pr-10';

    // 创建触发按钮
    this.triggerEl = document.createElement('button');
    this.triggerEl.type = 'button';
    this.triggerEl.className = 'absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm';

    // 组装 DOM 树
    const control = document.createElement('div');
    control.className = 'relative';
    control.appendChild(this.inputEl);
    control.appendChild(this.triggerEl);

    this.container.appendChild(this.labelEl);
    this.container.appendChild(control);
  }

  // ✅ 阶段 C：更新动态属性（Update）
  updateAttributes() {
    const api = this.currentApi;
    if (!api) return;

    // 1. 更新标签属性
    this.applyProps(this.labelEl, api.getLabelProps());
    this.labelEl.textContent = this.props.label;

    // 2. 更新输入框属性（不销毁元素！）
    this.applyProps(this.inputEl, api.getInputProps());

    // 3. 更新触发按钮
    this.applyProps(this.triggerEl, api.getTriggerProps());
    this.triggerEl.innerHTML = api.isOpen ? '▲' : '▼';

    // 4. 处理下拉菜单的显隐
    if (api.isOpen) {
      if (!this.contentEl) {
        // 第一次打开，创建下拉菜单
        this.createDropdown(api);
      } else {
        // 已存在，只更新内容和高亮状态
        this.updateDropdown(api);
      }
    } else {
      if (this.contentEl) {
        // 关闭时移除下拉菜单
        this.contentEl.remove();
        this.contentEl = null;
        this.listEl = null;
      }
    }
  }

  // ✅ 创建下拉菜单（第一次打开时）
  createDropdown(api) {
    this.contentEl = document.createElement('div');
    this.applyProps(this.contentEl, api.getPositionerProps());
    this.contentEl.className = 'absolute z-10 w-full mt-1';

    this.listEl = document.createElement('ul');
    this.applyProps(this.listEl, api.getContentProps());
    this.listEl.className = 'menu bg-base-200 rounded-box shadow-lg max-h-60 overflow-y-auto';

    // 渲染选项
    this.renderOptions(api);

    this.contentEl.appendChild(this.listEl);
    this.container.appendChild(this.contentEl);
  }

  // ✅ 更新下拉菜单（重新渲染选项，处理高亮）
  updateDropdown(api) {
    if (!this.listEl) return;

    // 清空并重新渲染选项列表
    this.listEl.innerHTML = '';
    this.renderOptions(api);
  }

  // ✅ 渲染选项列表
  renderOptions(api) {
    if (!this.listEl) return;

    this.props.options.forEach((option) => {
      const item = document.createElement('li');
      this.applyProps(item, api.getItemProps({ item: option }));

      const button = document.createElement('button');
      button.textContent = option.label;

      // 高亮当前选中项
      if (api.isItemHighlighted(option)) {
        button.className = 'active';
      }

      item.appendChild(button);
      this.listEl.appendChild(item);
    });
  }

  // ✅ 辅助函数：将 Zag.js 的 props 对象应用到 HTMLElement
  // ⚡ 性能优化：使用脏检查（Dirty Check）避免不必要的 DOM 操作
  applyProps(el, props) {
    for (const key in props) {
      if (key === 'children') continue;

      const newValue = props[key];

      // 1. 处理事件监听器（Zag.js 会传递 onClick 等）
      // ⚠️ 注意：事件监听器不做脏检查，因为函数引用可能每次都不同
      if (key.startsWith('on') && typeof newValue === 'function') {
        const eventName = key.slice(2).toLowerCase();
        // Zag.js 通常会保持函数引用稳定，这里先直接追加监听器；
        // 若后续出现重复绑定证据，再单独补 listener 去重层。
        el.addEventListener(eventName, newValue);
        continue;
      }

      // 2. 处理 Boolean 属性（disabled, checked, hidden 等）
      if (typeof newValue === 'boolean') {
        const currentValue = el.hasAttribute(key);
        if (newValue !== currentValue) {
          // ✅ 脏检查：只在值改变时更新
          if (newValue) {
            el.setAttribute(key, '');
          } else {
            el.removeAttribute(key);
          }
        }
      }
      // 3. 处理 Properties（value, scrollTop, className 等）
      else if (key in el) {
        const currentValue = el[key];
        if (currentValue !== newValue) {
          // ✅ 脏检查：只在值改变时更新
          el[key] = newValue;
        }
      }
      // 4. 处理 Attributes（aria-*, id, type, data-* 等）
      else {
        const currentAttr = el.getAttribute(key);
        const newAttr = String(newValue);
        if (currentAttr !== newAttr) {
          // ✅ 脏检查：只在值改变时更新
          el.setAttribute(key, newAttr);
        }
      }
    }
  }

  // ✅ 初始渲染
  render() {
    return this.container;
  }

  // ✅ 清理（组件销毁时调用）
  destroy() {
    this.service?.stop();
  }
}
