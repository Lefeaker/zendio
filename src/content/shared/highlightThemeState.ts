import type { ReaderHighlightTheme } from '@shared/types/options';

const HIGHLIGHT_THEME_STYLE_ATTRIBUTE = 'data-aiob-reader-highlight-theme';

const HIGHLIGHT_THEME_CSS = `
body {
  --reader-highlight-gradient: linear-gradient(
    90deg,
    rgba(111, 92, 255, 0.44),
    rgba(30, 108, 255, 0.46)
  );
  --reader-highlight-purple: rgba(111, 92, 255, 0.48);
  --reader-highlight-neon-yellow: rgba(255, 233, 88, 0.58);
  --reader-highlight-neon-green: rgba(114, 244, 126, 0.4);
  --reader-highlight-neon-orange: rgba(255, 184, 76, 0.42);
  --reader-highlight-bg: var(--reader-highlight-gradient);
  --reader-highlight-focus-color: rgba(111, 92, 255, 0.44);
  --reader-highlight-focus-color-soft: rgba(111, 92, 255, 0.2);
}

body[data-aiob-reader-highlight='gradient'] {
  --reader-highlight-bg: var(--reader-highlight-gradient);
  --reader-highlight-focus-color: rgba(111, 92, 255, 0.44);
  --reader-highlight-focus-color-soft: rgba(111, 92, 255, 0.2);
}

body[data-aiob-reader-highlight='purple'] {
  --reader-highlight-bg: var(--reader-highlight-purple);
  --reader-highlight-focus-color: rgba(111, 92, 255, 0.48);
  --reader-highlight-focus-color-soft: rgba(111, 92, 255, 0.22);
}

body[data-aiob-reader-highlight='neonYellow'] {
  --reader-highlight-bg: var(--reader-highlight-neon-yellow);
  --reader-highlight-focus-color: rgba(255, 233, 88, 0.58);
  --reader-highlight-focus-color-soft: rgba(255, 233, 88, 0.22);
}

body[data-aiob-reader-highlight='neonGreen'] {
  --reader-highlight-bg: var(--reader-highlight-neon-green);
  --reader-highlight-focus-color: rgba(114, 244, 126, 0.4);
  --reader-highlight-focus-color-soft: rgba(114, 244, 126, 0.18);
}

body[data-aiob-reader-highlight='neonOrange'] {
  --reader-highlight-bg: var(--reader-highlight-neon-orange);
  --reader-highlight-focus-color: rgba(255, 184, 76, 0.42);
  --reader-highlight-focus-color-soft: rgba(255, 184, 76, 0.18);
}

.aiob-reader-highlight {
  position: relative;
  display: inline;
  border-radius: 3px;
  padding: 1px 0;
  background: var(--reader-highlight-bg) !important;
  background-repeat: no-repeat;
  background-origin: border-box;
  background-clip: border-box;
  background-color: transparent !important;
  color: inherit !important;
  transition: box-shadow 0.3s ease;
  isolation: isolate;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.aiob-reader-highlight,
.aiob-reader-highlight * {
  color: inherit !important;
}

.aiob-reader-highlight.aiob-reader-highlight--focus {
  animation: aiob-reader-highlight-focus 1.4s ease-out;
}

@keyframes aiob-reader-highlight-focus {
  0% {
    box-shadow: 0 0 0 0 var(--reader-highlight-focus-color);
  }

  50% {
    box-shadow: 0 0 0 8px var(--reader-highlight-focus-color-soft);
  }

  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}
`.trim();

function getHighlightThemeHost(doc: Document): HTMLElement {
  return doc.body ?? doc.documentElement;
}

function ensureHighlightThemeStyle(doc: Document): void {
  const styleHost = doc.head ?? doc.documentElement;
  if (styleHost.querySelector(`style[${HIGHLIGHT_THEME_STYLE_ATTRIBUTE}]`)) {
    return;
  }
  const style = doc.createElement('style');
  style.setAttribute(HIGHLIGHT_THEME_STYLE_ATTRIBUTE, '');
  style.textContent = HIGHLIGHT_THEME_CSS;
  styleHost.appendChild(style);
}

export function applyHighlightThemeState(doc: Document, theme: ReaderHighlightTheme): void {
  const host = getHighlightThemeHost(doc);
  ensureHighlightThemeStyle(doc);
  host.dataset.aiobReaderHighlight = theme;
  host.dataset.aiobReaderHighlightTheme = theme;
}

export function clearHighlightThemeState(doc: Document): void {
  const host = getHighlightThemeHost(doc);
  delete host.dataset.aiobReaderHighlight;
  delete host.dataset.aiobReaderHighlightTheme;
  doc
    .querySelectorAll(`style[${HIGHLIGHT_THEME_STYLE_ATTRIBUTE}]`)
    .forEach((style) => style.remove());
}
