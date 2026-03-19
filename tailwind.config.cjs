const path = require('node:path');
const { optionsLikeTheme, daisyConfig } = require('./tailwind.shared.cjs');

/**
 * Tailwind 配置仅覆盖 Options 模块运行时会扫描到的模板。
 * 颜色/字体等主题变量继续由 design-tokens.css 提供，
 * 这里的自定义值主要引用 CSS 变量，方便在 Tailwind 中直接复用。
 */
module.exports = {
  content: [
    path.join(__dirname, 'src/options/**/*.{ts,tsx,js,jsx,html}'),
    path.join(__dirname, 'src/options/**/*.css'),
    path.join(__dirname, 'src/shared/**/*.{ts,tsx,js,jsx}'),
    path.join(__dirname, 'tests/visual/**/*.{html,js}')
  ],
  // Safelist required for POC test files in tests/visual/
  // These files are not part of the production build and their classes
  // are not detected by Tailwind's content scanner
  safelist: [
    'btn',
    'btn-primary',
    'btn-ghost',
    'input',
    'input-bordered',
    'menu',
    'bg-base-200',
    'rounded-box',
    'shadow-lg'
  ],
  theme: {
    extend: optionsLikeTheme
  },
  plugins: [
    require('daisyui')
  ],
  daisyui: daisyConfig
};
