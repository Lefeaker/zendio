/**
 * DaisyUI 组件工厂函数
 *
 * 用于统一创建 DaisyUI 风格的组件，保持代码一致性。
 * 遵循 Phase 1 迁移指南的最佳实践。
 *
 * @see docs/251126-design-system-poc/PHASE1-MIGRATION-GUIDE.md
 */

export interface ButtonOptions {
    variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'outline' | 'danger';
    size?: 'xs' | 'sm' | 'md' | 'lg';
    shape?: 'circle' | 'square';
    disabled?: boolean;
    loading?: boolean;
    /** 额外的 CSS 类名（用于项目特定样式如 btn-adaptive） */
    className?: string;
}

/**
 * 创建 DaisyUI 按钮
 *
 * @example
 * ```typescript
 * const saveBtn = createButton('Save', { variant: 'primary', size: 'sm' });
 * const cancelBtn = createButton('Cancel', { variant: 'ghost' });
 * const dangerBtn = createButton('Delete', { variant: 'danger', className: 'btn-adaptive' });
 * ```
 */
export function createButton(text: string, options: ButtonOptions = {}): HTMLButtonElement {
    const button = document.createElement('button');

    // 基础类
    const classes = ['btn'];

    // 变体
    if (options.variant) {
        classes.push(`btn-${options.variant}`);
    }

    // 尺寸
    if (options.size) {
        classes.push(`btn-${options.size}`);
    }

    // 形状
    if (options.shape) {
        classes.push(`btn-${options.shape}`);
    }

    // 加载状态
    if (options.loading) {
        classes.push('loading');
    }

    // 额外的自定义类名
    if (options.className) {
        classes.push(...options.className.split(' ').filter(c => c.trim()));
    }

    button.className = classes.join(' ');
    button.textContent = text;
    button.disabled = options.disabled || false;

    return button;
}

/**
 * 创建 DaisyUI 输入框
 */
export interface InputOptions {
    type?: 'text' | 'number' | 'email' | 'password' | 'search';
    placeholder?: string;
    bordered?: boolean;
    ghost?: boolean;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    disabled?: boolean;
}

export function createInput(options: InputOptions = {}): HTMLInputElement {
    const input = document.createElement('input');

    // 基础类
    const classes = ['input', 'w-full'];

    // 边框
    if (options.bordered !== false) {
        classes.push('input-bordered');
    }

    // 幽灵模式
    if (options.ghost) {
        classes.push('input-ghost');
    }

    // 尺寸
    if (options.size) {
        classes.push(`input-${options.size}`);
    }

    input.className = classes.join(' ');
    input.type = options.type || 'text';

    if (options.placeholder) {
        input.placeholder = options.placeholder;
    }

    input.disabled = options.disabled || false;

    return input;
}

/**
 * 创建 DaisyUI Alert
 */
export interface AlertOptions {
    type?: 'info' | 'success' | 'warning' | 'error';
    icon?: string; // Lucide icon name or SVG string
    dismissible?: boolean;
}

export function createAlert(message: string, options: AlertOptions = {}): HTMLDivElement {
    const alert = document.createElement('div');

    // 基础类
    const classes = ['alert'];

    // 类型
    if (options.type) {
        classes.push(`alert-${options.type}`);
    }

    alert.className = classes.join(' ');

    // 图标
    if (options.icon) {
        const icon = document.createElement('svg');
        icon.innerHTML = options.icon;
        icon.classList.add('stroke-current', 'shrink-0', 'w-6', 'h-6');
        alert.appendChild(icon);
    }

    // 消息
    const span = document.createElement('span');
    span.textContent = message;
    alert.appendChild(span);

    // 关闭按钮
    if (options.dismissible) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn btn-sm btn-circle btn-ghost';
        closeBtn.innerHTML = '✕';
        closeBtn.addEventListener('click', () => alert.remove());
        alert.appendChild(closeBtn);
    }

    return alert;
}
