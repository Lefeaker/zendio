import { createIcon, Icons } from '@shared/utils/iconHelpers';

export class ThemeSwitcher {
	private toggle: HTMLInputElement | null = null;
	private currentTheme: 'light' | 'dark' = 'light';
	private container: HTMLElement;

	constructor(container: HTMLElement) {
		this.container = container;
	}

	/**
	 * 初始化主题切换器
	 * 1. 读取保存的主题偏好
	 * 2. 创建 UI 控件
	 * 3. 应用主题
	 */
	init(): void {
		this.currentTheme = this.loadTheme();
		this.createUI();
		this.applyTheme(this.currentTheme, false);
	}

	/**
	 * 创建主题切换 UI
	 */
	private createUI(): void {
		const wrapper = document.createElement('div');
		wrapper.className = 'flex items-center gap-2';

		const moonIcon = createIcon(Icons.Moon, {
			size: 20,
			className: 'text-base-content'
		});
		moonIcon.setAttribute('aria-hidden', 'true');

		// DaisyUI Toggle 开关
		this.toggle = document.createElement('input');
		this.toggle.type = 'checkbox';
		this.toggle.className = 'toggle toggle-primary';
		this.toggle.checked = this.currentTheme === 'dark';
		this.toggle.setAttribute('aria-label', 'Toggle dark mode');

		const sunIcon = createIcon(Icons.Sun, {
			size: 20,
			className: 'text-base-content'
		});
		sunIcon.setAttribute('aria-hidden', 'true');

		// 标签文本
		const label = document.createElement('label');
		label.className = 'flex items-center gap-2 cursor-pointer select-none';
		label.append(moonIcon, this.toggle, sunIcon);

		// 提示文本
		const hint = document.createElement('span');
		hint.className = 'text-sm text-base-content/60 ml-2';
		hint.textContent = this.currentTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
		hint.id = 'theme-hint';

		wrapper.append(label, hint);
		this.container.replaceChildren(wrapper);

		// 绑定事件
		this.toggle.addEventListener('change', (e) => {
			const checked = (e.target as HTMLInputElement).checked;
			const theme = checked ? 'dark' : 'light';
			this.applyTheme(theme, true);
			this.saveTheme(theme);

			// 更新提示文本
			hint.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
		});
	}

	/**
	 * 应用主题到页面
	 * @param theme - 主题名称
	 * @param animate - 是否显示切换动画
	 */
	private applyTheme(theme: 'light' | 'dark', animate: boolean): void {
		const html = document.documentElement;

		// 可选：添加切换动画
		if (animate) {
			html.classList.add('theme-transitioning');
			setTimeout(() => {
				html.classList.remove('theme-transitioning');
			}, 300);
		}

		// 设置 data-theme 属性
		html.setAttribute('data-theme', theme);
		this.currentTheme = theme;

		// 触发自定义事件（供其他组件监听）
		window.dispatchEvent(
			new CustomEvent('theme-changed', {
				detail: { theme },
			})
		);
	}

	/**
	 * 保存主题偏好到 localStorage
	 */
	private saveTheme(theme: 'light' | 'dark'): void {
		try {
			localStorage.setItem('aob-theme', theme);
		} catch (error) {
			console.warn('[ThemeSwitcher] Failed to save theme preference:', error);
		}
	}

	/**
	 * 读取主题偏好
	 * 优先级：localStorage > 系统偏好 > 默认 light
	 */
	private loadTheme(): 'light' | 'dark' {
		try {
			// 1. 读取 localStorage
			const saved = localStorage.getItem('aob-theme');
			if (saved === 'dark' || saved === 'light') {
				return saved;
			}

			// 2. 检测系统偏好（可选）
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			return prefersDark ? 'dark' : 'light';
		} catch (error) {
			console.warn('[ThemeSwitcher] Failed to load theme preference:', error);
			return 'light';
		}
	}

	/**
	 * 销毁主题切换器
	 */
	destroy(): void {
		this.toggle = null;
		this.container.replaceChildren();
	}
}
