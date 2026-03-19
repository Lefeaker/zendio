const optionsLikeTheme = {
  fontFamily: {
    ui: 'var(--aobx-font-ui)'
  },
  colors: {
    accent: 'var(--aobx-accent)',
    'accent-soft': 'var(--aobx-accent-soft)',
    surface: 'var(--aobx-surface-0)',
    'surface-1': 'var(--aobx-surface-1)',
    'surface-2': 'var(--aobx-surface-2)',
    border: 'var(--aobx-border)',
    divider: 'var(--aobx-divider)',
    text: 'var(--aobx-text)',
    'text-muted': 'var(--aobx-text-muted)',
    'text-strong': 'var(--aobx-text-strong)',
    'status-success': 'var(--aobx-status-success)',
    'status-warning': 'var(--aobx-status-warning)',
    'status-error': 'var(--aobx-status-error)'
  },
  borderRadius: {
    lg: 'var(--aobx-radius-lg)',
    md: 'var(--aobx-radius-md)',
    sm: 'var(--aobx-radius-sm)'
  },
  spacing: {
    0.5: 'var(--aobx-space-0_5)',
    1: 'var(--aobx-space-1)',
    1.5: 'var(--aobx-space-1_5)',
    2: 'var(--aobx-space-2)',
    3: 'var(--aobx-space-3)',
    4: 'var(--aobx-space-4)',
    5: 'var(--aobx-space-5)',
    6: 'var(--aobx-space-6)',
    7: 'var(--aobx-space-7)',
    8: 'var(--aobx-space-8)',
    12: 'var(--aobx-space-12)'
  }
};

const globalTheme = {
  fontFamily: {
    sans: 'var(--font-family)',
    mono: 'var(--font-mono)',
    ui: 'var(--font-family)'
  },
  colors: {
    bg: 'var(--bg)',
    'bg-1': 'var(--bg-elev-1)',
    'bg-2': 'var(--bg-elev-2)',
    border: 'var(--border)',
    'border-hover': 'var(--border-hover)',
    text: 'var(--text)',
    'text-dim': 'var(--text-dim)',
    'text-muted': 'var(--text-muted)',
    accent: {
      start: 'var(--accent-start)',
      mid: 'var(--accent-mid)',
      end: 'var(--accent-end)',
      solid: 'var(--accent-solid)'
    },
    ok: 'var(--ok)',
    'ok-bg': 'var(--ok-bg)',
    warn: 'var(--warn)',
    'warn-bg': 'var(--warn-bg)',
    err: 'var(--err)',
    'err-bg': 'var(--err-bg)'
  },
  backgroundImage: {
    'gradient-primary': 'var(--gradient-primary)',
    'gradient-text': 'var(--gradient-text)'
  },
  spacing: {
    xs: 'var(--space-xs)',
    sm: 'var(--space-sm)',
    md: 'var(--space-md)',
    lg: 'var(--space-lg)',
    xl: 'var(--space-xl)',
    '2xl': 'var(--space-2xl)',
    '3xl': 'var(--space-3xl)'
  },
  fontSize: {
    xs: 'var(--font-size-xs)',
    sm: 'var(--font-size-sm)',
    base: 'var(--font-size-base)',
    md: 'var(--font-size-md)',
    lg: 'var(--font-size-lg)',
    xl: 'var(--font-size-xl)',
    '2xl': 'var(--font-size-2xl)',
    '3xl': 'var(--font-size-3xl)',
    '4xl': 'var(--font-size-4xl)'
  },
  transitionDuration: {
    fast: 'var(--transition-fast)',
    base: 'var(--transition-base)',
    slow: 'var(--transition-slow)'
  },
  transitionTimingFunction: {
    'out-cubic': 'var(--ease-out-cubic)',
    'in-out': 'var(--ease-in-out)'
  },
  zIndex: {
    dropdown: 'var(--z-dropdown)',
    sticky: 'var(--z-sticky)',
    'modal-backdrop': 'var(--z-modal-backdrop)',
    modal: 'var(--z-modal)',
    tooltip: 'var(--z-tooltip)',
    notification: 'var(--z-notification)'
  },
  borderRadius: {
    xs: 'var(--radius-xs)',
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)'
  },
  boxShadow: {
    soft: 'var(--shadow-soft)',
    card: 'var(--shadow-card)',
    button: 'var(--shadow-button)',
    'button-hover': 'var(--shadow-button-hover)',
    neon: 'var(--shadow-neon)'
  }
};

const daisyThemes = [
  'light',
  'dark',
  {
    allinob: {
      primary: 'oklch(0.65 0.25 285)',
      secondary: 'oklch(0.55 0.15 260)',
      accent: 'oklch(0.65 0.25 285)',
      neutral: 'oklch(0.25 0.05 260)',
      'base-100': 'oklch(1 0 0)',
      info: '#3b82f6',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444'
    }
  }
];

const daisyConfig = {
  themes: daisyThemes,
  darkTheme: 'dark',
  base: true,
  styled: true,
  utils: true,
  logs: true
};

module.exports = {
  optionsLikeTheme,
  globalTheme,
  daisyThemes,
  daisyConfig
};
