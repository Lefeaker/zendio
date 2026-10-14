import { getContentI18nResource } from '../../i18n/context';
import { RUNTIME_FALLBACK_MESSAGES } from '@i18n/catalog/runtimeFallbackMessages';
import { createContentButtonElement } from '@ui/primitives/button';
import type {
  SessionExportAttempt,
  SessionExportRecoveryAction
} from '../../../shared/sessionDrafts/exportAttempt';

export type SessionPanelRecoveryMode = 'ready' | 'loading' | 'busy' | 'retry' | 'reload';
type Surface = 'reader' | 'video';
type Control = HTMLButtonElement | HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement;
interface RecoveryState {
  host: HTMLElement;
  mode: SessionPanelRecoveryMode;
  controls: Map<Control, { disabled: boolean; readOnly?: boolean }>;
  reloadButtons: Map<HTMLButtonElement, EventListener>;
}
const states = new WeakMap<Document, Map<Surface, RecoveryState>>();

function restore(state: RecoveryState): void {
  delete state.host.dataset.sessionRecovery;
  for (const [control, original] of state.controls) {
    control.disabled = original.disabled;
    if ('readOnly' in control && original.readOnly !== undefined)
      control.readOnly = original.readOnly;
  }
  for (const [button, handler] of state.reloadButtons)
    button.removeEventListener('click', handler, true);
}

function apply(state: RecoveryState, doc: Document): void {
  const root = state.host.shadowRoot ?? state.host;
  const messages = getContentI18nResource()?.messages ?? RUNTIME_FALLBACK_MESSAGES;
  if (state.host.dataset.sessionRecovery !== state.mode)
    state.host.dataset.sessionRecovery = state.mode;
  for (const control of Array.from(
    root.querySelectorAll<Control>('button, select, input, textarea')
  )) {
    if (!state.controls.has(control))
      state.controls.set(control, {
        disabled: control.disabled,
        ...('readOnly' in control ? { readOnly: control.readOnly } : {})
      });
    const action = control.getAttribute('data-action-id');
    const cancel = action === 'reader:cancel' || action === 'video:cancel';
    const finish = action === 'reader:finish' || action === 'video:finish';
    const toggle = action === 'session:toggleCollapse';
    if (
      'readOnly' in control &&
      (control.tagName === 'TEXTAREA' ||
        !['checkbox', 'radio', 'range', 'file', 'color'].includes(control.type))
    ) {
      if (!control.readOnly) control.readOnly = true;
      continue;
    }
    const enabled =
      toggle ||
      (state.mode === 'retry' && (cancel || finish)) ||
      ((state.mode === 'loading' || state.mode === 'reload') && cancel);
    const disabled = !enabled || (state.controls.get(control)?.disabled ?? false);
    if (control.disabled !== disabled) control.disabled = disabled;
    if (state.mode === 'reload' && cancel && control.tagName === 'BUTTON') {
      const button = control as HTMLButtonElement;
      if (button.textContent !== messages.reloadButton) button.textContent = messages.reloadButton;
      if (button.getAttribute('aria-label') !== messages.reloadButton)
        button.setAttribute('aria-label', messages.reloadButton);
      if (!state.reloadButtons.has(button)) {
        const reload: EventListener = (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          doc.defaultView?.location.reload();
        };
        state.reloadButtons.set(button, reload);
        button.addEventListener('click', reload, true);
      }
    }
  }
  const status = root.querySelector<HTMLElement>('[data-session-status]');
  const hint =
    state.mode === 'reload'
      ? messages.runtimeReloadRequired
      : state.mode === 'retry'
        ? messages.sessionFinishRetry
        : null;
  if (status && hint && status.textContent !== hint) status.textContent = hint;
}

export function setSessionPanelRecovery(
  doc: Document,
  surface: Surface,
  mode: SessionPanelRecoveryMode
): void {
  const bySurface = states.get(doc) ?? new Map<Surface, RecoveryState>();
  let state = bySurface.get(surface);
  if (state?.mode === 'reload' && mode !== 'reload') return;
  if (mode === 'ready') {
    if (state) restore(state);
    bySurface.delete(surface);
    return;
  }
  const host = doc.getElementById(`aiob-${surface}-panel`);
  if (!host) return;
  if (state?.host !== host) {
    if (state) restore(state);
    const next: RecoveryState = {
      host,
      mode,
      controls: new Map(),
      reloadButtons: new Map()
    };
    state = next;
    bySurface.set(surface, state);
    states.set(doc, bySurface);
  }
  state.mode = mode;
  apply(state, doc);
}

export function disposeSessionPanelRecovery(doc: Document): void {
  for (const state of states.get(doc)?.values() ?? []) restore(state);
  states.delete(doc);
}

/** Called by the owning panel after rendering, never by an observer of its own DOM writes. */
export function refreshSessionPanelRecovery(doc: Document, surface: Surface): void {
  const state = states.get(doc)?.get(surface);
  if (state) apply(state, doc);
}

/** Feature-owned notice; the existing panel and input nodes keep their identity. */
export function showSessionExportNotice(
  doc: Document,
  surface: Surface,
  messageKey: string,
  recover?: (action: SessionExportRecoveryAction) => void,
  attempt?: SessionExportAttempt
): void {
  const host = doc.getElementById(`aiob-${surface}-panel`);
  const root = host?.shadowRoot ?? host;
  if (!root) return;
  clearSessionExportNotice(doc, surface);
  const messages = getContentI18nResource()?.messages ?? RUNTIME_FALLBACK_MESSAGES;
  const key = Object.prototype.hasOwnProperty.call(RUNTIME_FALLBACK_MESSAGES, messageKey)
    ? (messageKey as keyof typeof RUNTIME_FALLBACK_MESSAGES)
    : 'saveFailureGeneric';
  const notice = doc.createElement('aside');
  notice.dataset.sessionExportNotice = surface;
  notice.className = 'surface-window-footer';
  const description = doc.createElement('p');
  description.setAttribute('role', 'status');
  description.textContent = messages[key];
  notice.append(description);
  if (attempt?.targetLabel || attempt?.filePath || attempt?.requestedPath) {
    const target = doc.createElement('p');
    target.textContent = [attempt.targetLabel, attempt.filePath ?? attempt.requestedPath]
      .filter(Boolean)
      .join(' · ');
    notice.append(target);
  }
  if (recover) {
    const actions = doc.createElement('div');
    actions.className = 'surface-action-row';
    for (const [action, label] of [
      ['save-again', messages.saveRecoverySaveAgain],
      ['confirm-saved', messages.saveRecoveryConfirmSaved]
    ] as const) {
      actions.append(
        createContentButtonElement({
          label,
          variant: 'secondary',
          size: 'sm',
          classSlots: ['btn', 'secondary'],
          dataAttributes: { exportRecovery: action },
          onClick: () => recover(action)
        })
      );
    }
    notice.append(actions);
  }
  root.querySelector('.surface-window-body')?.prepend(notice);
}

export function clearSessionExportNotice(doc: Document, surface: Surface): void {
  const host = doc.getElementById(`aiob-${surface}-panel`);
  (host?.shadowRoot ?? host)?.querySelector('[data-session-export-notice]')?.remove();
}
