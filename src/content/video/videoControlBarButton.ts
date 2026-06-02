import { findVideoControlTarget } from './videoPromptObserver';
import { bindVideoInputKeyboardIsolationBoundary } from './videoInputEventIsolation';

const CONTROL_BUTTON_CLASS = 'aiob-video-control-bar-button';
const CONTROL_POPOVER_CLASS = 'aiob-video-control-bar-popover';
const CONTROL_STYLE_ID = 'aiob-video-control-bar-button-style';
const popoverKeyboardIsolationDisposers = new WeakMap<HTMLElement, () => void>();
type VideoControlBarPlatform = 'youtube' | 'bilibili' | 'generic';

export interface VideoControlBarPreferences {
  autoPauseEnabled: boolean;
  captureScreenshotEnabled: boolean;
}

export interface VideoControlBarNotePayload {
  comment: string;
  source: 'note-input';
}

export interface VideoControlBarButtonOptions {
  doc: Document;
  url: string;
  label: string;
  shortcut: string;
  getIconUrl?: () => string | null;
  preferences?: VideoControlBarPreferences;
  onPreferencesChange?: (preferences: VideoControlBarPreferences) => void;
  onPopoverOpen?: (preferences: VideoControlBarPreferences) => void;
  onPopoverDismiss?: (preferences: VideoControlBarPreferences) => void;
  onPrimaryAction: (
    preferences: VideoControlBarPreferences,
    payload?: VideoControlBarNotePayload
  ) => void;
}

const DEFAULT_PREFERENCES: VideoControlBarPreferences = {
  autoPauseEnabled: true,
  captureScreenshotEnabled: true
};

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
  align-self: center;
  flex: 0 0 auto;
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
  vertical-align: middle;
}
.${CONTROL_BUTTON_CLASS}--youtube {
  transform: translateY(0);
}
.${CONTROL_BUTTON_CLASS}--bilibili {
  width: 25px !important;
  height: 25px !important;
  min-width: 25px !important;
  margin: 0 6px;
  transform: translateY(-4px);
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
.${CONTROL_BUTTON_CLASS}--bilibili .${CONTROL_BUTTON_CLASS}__icon {
  width: 22px;
  height: 22px;
}
.${CONTROL_POPOVER_CLASS} {
  --aiob-video-control-accent: #8b5cf6;
  position: fixed;
  z-index: 2147483647;
  display: grid;
  gap: 10px;
  width: 220px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  background: rgba(15, 17, 28, 0.96);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.36);
  color: #fff;
  font: 13px/1.4 system-ui, sans-serif;
}
.${CONTROL_POPOVER_CLASS}[hidden] {
  display: none;
}
.${CONTROL_POPOVER_CLASS}__note-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 34px;
  padding: 7px 9px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font: 13px/1.35 system-ui, sans-serif;
}
.${CONTROL_POPOVER_CLASS}__note-input::placeholder {
  color: rgba(255, 255, 255, 0.46);
}
.${CONTROL_POPOVER_CLASS}__note-input:focus-visible {
  border-color: var(--aiob-video-control-accent);
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.28);
  outline: 0;
}
.${CONTROL_POPOVER_CLASS}__option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  color: rgba(255, 255, 255, 0.82);
}
.${CONTROL_POPOVER_CLASS}__option input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--aiob-video-control-accent);
}
`;
  (doc.head ?? doc.documentElement).appendChild(style);
}

function resolvePlatform(url: string): VideoControlBarPlatform {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('youtube.com') || hostname === 'youtu.be') {
      return 'youtube';
    }
    if (hostname.includes('bilibili.com')) {
      return 'bilibili';
    }
  } catch {
    return 'generic';
  }
  return 'generic';
}

function createControlBarButton(doc: Document): HTMLButtonElement {
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

function resolvePreferences(
  preferences: VideoControlBarButtonOptions['preferences']
): VideoControlBarPreferences {
  return {
    autoPauseEnabled: preferences?.autoPauseEnabled ?? DEFAULT_PREFERENCES.autoPauseEnabled,
    captureScreenshotEnabled:
      preferences?.captureScreenshotEnabled ?? DEFAULT_PREFERENCES.captureScreenshotEnabled
  };
}

function positionPopover(button: HTMLButtonElement, popover: HTMLElement): void {
  const rect = button.getBoundingClientRect();
  const width = 220;
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - width / 2, 8),
    Math.max(window.innerWidth - width - 8, 8)
  );
  const top =
    rect.top > 120
      ? Math.max(rect.top - popover.offsetHeight - 12, 8)
      : Math.min(rect.bottom + 12, window.innerHeight - popover.offsetHeight - 8);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function removePopover(doc: Document): void {
  doc.querySelectorAll<HTMLElement>(`.${CONTROL_POPOVER_CLASS}`).forEach((popover) => {
    popoverKeyboardIsolationDisposers.get(popover)?.();
    popoverKeyboardIsolationDisposers.delete(popover);
    popover.remove();
  });
}

function createPreferenceToggle(
  doc: Document,
  preference: keyof VideoControlBarPreferences,
  label: string,
  checked: boolean,
  onChange: (preference: keyof VideoControlBarPreferences, checked: boolean) => void
): HTMLLabelElement {
  const row = doc.createElement('label');
  row.className = `${CONTROL_POPOVER_CLASS}__option`;

  const input = doc.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.dataset.preference = preference;
  input.addEventListener('change', () => onChange(preference, input.checked));

  const copy = doc.createElement('span');
  copy.textContent = label;

  row.append(input, copy);
  return row;
}

function openPopover(button: HTMLButtonElement, options: VideoControlBarButtonOptions): void {
  const doc = options.doc;
  const existing = doc.querySelector<HTMLElement>(`.${CONTROL_POPOVER_CLASS}`);
  if (existing) {
    popoverKeyboardIsolationDisposers.get(existing)?.();
    popoverKeyboardIsolationDisposers.delete(existing);
    existing.remove();
    return;
  }

  let preferences = resolvePreferences(options.preferences);
  const popover = doc.createElement('div');
  popover.className = CONTROL_POPOVER_CLASS;
  popover.dataset.aiobVideoControlBarPopover = 'true';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', options.label);
  const disposeKeyboardIsolation = bindVideoInputKeyboardIsolationBoundary(popover);
  popoverKeyboardIsolationDisposers.set(popover, disposeKeyboardIsolation);

  const closePopover = (notifyDismiss: boolean): void => {
    doc.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    disposeKeyboardIsolation();
    popoverKeyboardIsolationDisposers.delete(popover);
    popover.remove();
    if (notifyDismiss) {
      options.onPopoverDismiss?.(preferences);
    }
  };

  function handleDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (popover.contains(target) || button.contains(target)) {
      return;
    }
    closePopover(true);
  }

  const noteInput = doc.createElement('input');
  noteInput.type = 'text';
  noteInput.className = `${CONTROL_POPOVER_CLASS}__note-input`;
  noteInput.dataset.aiobVideoControlBarNoteInput = 'true';
  noteInput.placeholder = 'Add note';
  noteInput.setAttribute('aria-label', 'Add video note');

  const onToggle = (preference: keyof VideoControlBarPreferences, checked: boolean): void => {
    preferences = {
      ...preferences,
      [preference]: checked
    };
    options.onPreferencesChange?.(preferences);
  };

  const autoPause = createPreferenceToggle(
    doc,
    'autoPauseEnabled',
    '自动暂停视频',
    preferences.autoPauseEnabled,
    onToggle
  );
  const screenshot = createPreferenceToggle(
    doc,
    'captureScreenshotEnabled',
    '捕捉当前视频截图',
    preferences.captureScreenshotEnabled,
    onToggle
  );

  const submitNote = (): void => {
    closePopover(false);
    options.onPrimaryAction(preferences, {
      comment: noteInput.value.trim(),
      source: 'note-input'
    });
  };

  noteInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    submitNote();
  });

  popover.append(noteInput, autoPause, screenshot);
  (doc.body ?? doc.documentElement).appendChild(popover);
  doc.addEventListener('pointerdown', handleDocumentPointerDown, true);
  positionPopover(button, popover);
  options.onPopoverOpen?.(preferences);
  if (preferences.autoPauseEnabled) {
    noteInput.focus({ preventScroll: true });
  }
}

function updateButton(button: HTMLButtonElement, options: VideoControlBarButtonOptions): void {
  const platform = resolvePlatform(options.url);
  button.classList.toggle(`${CONTROL_BUTTON_CLASS}--youtube`, platform === 'youtube');
  button.classList.toggle(`${CONTROL_BUTTON_CLASS}--bilibili`, platform === 'bilibili');
  button.setAttribute('aria-label', options.label);
  button.title = options.shortcut ? `${options.label} - ${options.shortcut}` : options.label;
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    openPopover(button, options);
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
    removePopover(options.doc);
    button.remove();
    button = null;
  }
  if (!button) {
    button = createControlBarButton(options.doc);
    target.insertBefore(button, target.firstChild);
  }

  updateButton(button, options);
  return true;
}

export function removeVideoControlBarButton(doc: Document): void {
  removePopover(doc);
  doc
    .querySelectorAll(`.${CONTROL_BUTTON_CLASS}[data-aiob-video-control-bar-button="true"]`)
    .forEach((button) => button.remove());
}
