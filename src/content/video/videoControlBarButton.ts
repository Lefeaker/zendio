import { findVideoControlTarget } from './videoPromptObserver';

const CONTROL_BUTTON_CLASS = 'aiob-video-control-bar-button';
const CONTROL_STYLE_ID = 'aiob-video-control-bar-button-style';

export interface VideoControlBarButtonOptions {
  doc: Document;
  url: string;
  label: string;
  shortcut: string;
  getIconUrl?: () => string | null;
  onPrimaryAction: () => void;
}

function ensureStyle(doc: Document): void {
  if (doc.getElementById(CONTROL_STYLE_ID)) {
    return;
  }

  const style = doc.createElement('style');
  style.id = CONTROL_STYLE_ID;
  style.textContent = `
.${CONTROL_BUTTON_CLASS} {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 31px !important;
  height: 31px !important;
  min-width: 31px !important;
  margin: 0 8px;
  padding: 0;
  border: 0 !important;
  background: transparent !important;
  color: #fff;
  cursor: pointer;
  opacity: 0.94;
}
.${CONTROL_BUTTON_CLASS}:hover,
.${CONTROL_BUTTON_CLASS}:focus-visible {
  opacity: 1;
  outline: 0;
}
.${CONTROL_BUTTON_CLASS}__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  background: center / contain no-repeat;
  color: currentColor;
  font: 700 13px/1 system-ui, sans-serif;
  pointer-events: none;
}
`;
  (doc.head ?? doc.documentElement).appendChild(style);
}

function createButton(doc: Document): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = CONTROL_BUTTON_CLASS;
  button.dataset.aiobVideoControlBarButton = 'true';

  const icon = doc.createElement('span');
  icon.className = `${CONTROL_BUTTON_CLASS}__icon`;
  icon.textContent = 'AI';
  button.appendChild(icon);
  return button;
}

function updateButton(button: HTMLButtonElement, options: VideoControlBarButtonOptions): void {
  button.setAttribute('aria-label', options.label);
  button.title = options.shortcut ? `${options.label} - ${options.shortcut}` : options.label;
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onPrimaryAction();
  };

  const icon = button.querySelector<HTMLElement>(`.${CONTROL_BUTTON_CLASS}__icon`);
  if (!icon) {
    return;
  }
  try {
    const iconUrl = options.getIconUrl?.();
    if (iconUrl) {
      icon.style.backgroundImage = `url("${iconUrl}")`;
      icon.textContent = '';
      return;
    }
  } catch {
    // Keep the text fallback.
  }
  icon.style.backgroundImage = '';
  icon.textContent = 'AI';
}

export function ensureVideoControlBarButton(options: VideoControlBarButtonOptions): boolean {
  const target = findVideoControlTarget(options.doc, options.url);
  if (!target) {
    removeVideoControlBarButton(options.doc);
    return false;
  }

  ensureStyle(options.doc);

  let button = options.doc.querySelector<HTMLButtonElement>(
    `.${CONTROL_BUTTON_CLASS}[data-aiob-video-control-bar-button="true"]`
  );
  if (button && button.parentElement !== target) {
    button.remove();
    button = null;
  }
  if (!button) {
    button = createButton(options.doc);
    target.insertBefore(button, target.firstChild);
  }

  updateButton(button, options);
  return true;
}

export function removeVideoControlBarButton(doc: Document): void {
  doc
    .querySelectorAll(`.${CONTROL_BUTTON_CLASS}[data-aiob-video-control-bar-button="true"]`)
    .forEach((button) => button.remove());
}
