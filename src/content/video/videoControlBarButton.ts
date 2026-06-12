import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { findVideoControlTarget } from './videoPromptObserver';
import { ensureVideoControlBarStyles } from './videoControlBarStyles';
import {
  CONTROL_POPOVER_CLASS,
  closeVideoControlBarPopovers,
  createVideoControlBarPopoverController,
  type VideoControlBarPopoverCloseReason
} from './videoControlBarPopoverController';
export type { VideoControlBarPopoverCloseReason } from './videoControlBarPopoverController';

const CONTROL_BUTTON_CLASS = 'aiob-video-control-bar-button';
type VideoControlBarPlatform = 'youtube' | 'bilibili' | 'generic';

export interface VideoControlBarPreferences {
  autoPauseEnabled: boolean;
  captureScreenshotEnabled: boolean;
}

export interface VideoControlBarNotePayload {
  comment: string;
  source: 'note-input';
}

export interface VideoControlBarButtonTexts {
  notePlaceholder: string;
  noteAriaLabel: string;
  autoPauseLabel: string;
  screenshotLabel: string;
}

export interface VideoControlBarButtonOptions {
  doc: Document;
  url: string;
  label: string;
  shortcut: string;
  texts?: VideoControlBarButtonTexts;
  getIconUrl?: () => string | null;
  preferences?: VideoControlBarPreferences;
  onPreferencesChange?: (preferences: VideoControlBarPreferences) => void;
  onPopoverOpen?: (preferences: VideoControlBarPreferences) => void;
  onPopoverDismiss?: (preferences: VideoControlBarPreferences) => void;
  onPopoverClose?: (
    reason: VideoControlBarPopoverCloseReason,
    preferences: VideoControlBarPreferences
  ) => void;
  onPrimaryAction: (
    preferences: VideoControlBarPreferences,
    payload?: VideoControlBarNotePayload
  ) => void | PromiseLike<void>;
}

const DEFAULT_PREFERENCES: VideoControlBarPreferences = {
  autoPauseEnabled: true,
  captureScreenshotEnabled: true
};

const DEFAULT_CONTROL_BAR_TEXTS: VideoControlBarButtonTexts = {
  notePlaceholder: DEFAULT_RUNTIME_MESSAGES.videoControlBarNotePlaceholder,
  noteAriaLabel: DEFAULT_RUNTIME_MESSAGES.videoControlBarNoteAriaLabel,
  autoPauseLabel: DEFAULT_RUNTIME_MESSAGES.videoControlBarAutoPauseLabel,
  screenshotLabel: DEFAULT_RUNTIME_MESSAGES.videoControlBarScreenshotLabel
};

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

function resolveTexts(texts: VideoControlBarButtonOptions['texts']): VideoControlBarButtonTexts {
  return {
    notePlaceholder: texts?.notePlaceholder ?? DEFAULT_CONTROL_BAR_TEXTS.notePlaceholder,
    noteAriaLabel: texts?.noteAriaLabel ?? DEFAULT_CONTROL_BAR_TEXTS.noteAriaLabel,
    autoPauseLabel: texts?.autoPauseLabel ?? DEFAULT_CONTROL_BAR_TEXTS.autoPauseLabel,
    screenshotLabel: texts?.screenshotLabel ?? DEFAULT_CONTROL_BAR_TEXTS.screenshotLabel
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

function isPromiseLike(value: void | PromiseLike<void>): value is PromiseLike<void> {
  return value !== undefined && typeof value.then === 'function';
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
    closeVideoControlBarPopovers(doc, 'toggle-dismiss');
    return;
  }

  let preferences = resolvePreferences(options.preferences);
  const texts = resolveTexts(options.texts);
  const popover = doc.createElement('div');
  popover.className = CONTROL_POPOVER_CLASS;
  popover.dataset.aiobVideoControlBarPopover = 'true';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', options.label);
  const popoverController = createVideoControlBarPopoverController({
    doc,
    button,
    popover,
    getPreferences: () => preferences,
    onPopoverDismiss: options.onPopoverDismiss,
    onPopoverClose: options.onPopoverClose
  });

  const noteInput = doc.createElement('input');
  noteInput.type = 'text';
  noteInput.className = `${CONTROL_POPOVER_CLASS}__note-input`;
  noteInput.dataset.aiobVideoControlBarNoteInput = 'true';
  noteInput.placeholder = texts.notePlaceholder;
  noteInput.setAttribute('aria-label', texts.noteAriaLabel);

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
    texts.autoPauseLabel,
    preferences.autoPauseEnabled,
    onToggle
  );
  const screenshot = createPreferenceToggle(
    doc,
    'captureScreenshotEnabled',
    texts.screenshotLabel,
    preferences.captureScreenshotEnabled,
    onToggle
  );

  const submitNote = (): void => {
    popoverController.close('submit');
    const result = options.onPrimaryAction(preferences, {
      comment: noteInput.value.trim(),
      source: 'note-input'
    });
    if (isPromiseLike(result)) {
      void Promise.resolve(result).catch((error: Error) => {
        console.warn('[VideoControlBarButton] Primary action failed:', error);
      });
    }
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

  ensureVideoControlBarStyles(options.doc);

  let button = options.doc.querySelector<HTMLButtonElement>(
    `.${CONTROL_BUTTON_CLASS}[data-aiob-video-control-bar-button="true"]`
  );
  if (button && button.parentElement !== target) {
    closeVideoControlBarPopovers(options.doc, 'owner-removal');
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
  closeVideoControlBarPopovers(doc, 'owner-removal');
  doc
    .querySelectorAll(`.${CONTROL_BUTTON_CLASS}[data-aiob-video-control-bar-button="true"]`)
    .forEach((button) => button.remove());
}
