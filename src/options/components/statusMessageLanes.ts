import { getOptionalElementById } from '../utils/dom';
import {
  bindLocalizedText,
  type BoundElement,
  type LocalizedContent
} from '../utils/localizedText';

export type StatusMessageType = 'success' | 'error';
export type StatusMessageContent = string | LocalizedContent;

interface GeneralLaneState {
  timer: number | undefined;
  binding: BoundElement<HTMLElement> | null;
}

interface AutoSaveLaneState {
  version: number;
  bindings: Array<BoundElement<HTMLElement>>;
}

export interface AutoSaveFailurePresentation {
  message: StatusMessageContent;
  guidance?: StatusMessageContent;
  retryLabel: StatusMessageContent;
  retry(): Promise<void>;
}

const generalState: GeneralLaneState = { timer: undefined, binding: null };
const autoSaveState: AutoSaveLaneState = { version: 0, bindings: [] };

export function showGeneralStatusMessage(
  type: StatusMessageType,
  content: StatusMessageContent
): void {
  const lane = getLane('general');
  const host = lane.parentElement;
  if (host) {
    host.className = `aobx-status-message is-${type}`;
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
  }
  lane.hidden = false;
  lane.className = `aobx-status-message__lane is-general is-${type}`;
  lane.setAttribute('role', 'status');
  lane.setAttribute('aria-live', 'polite');
  generalState.binding?.dispose();
  generalState.binding = bindLocalizedText(lane, content);
  if (generalState.timer) window.clearTimeout(generalState.timer);
  generalState.timer = window.setTimeout(() => clearGeneralLane(lane), 2000);
}

export function showAutoSaveFailureLane(presentation: AutoSaveFailurePresentation): void {
  const lane = getLane('autosave');
  disposeAutoSaveBindings();
  const version = ++autoSaveState.version;
  lane.hidden = false;
  lane.className = 'aobx-status-message__lane is-autosave is-error';
  lane.setAttribute('role', 'alert');
  lane.setAttribute('aria-live', 'assertive');
  lane.setAttribute('aria-atomic', 'true');

  const copy = document.createElement('div');
  copy.className = 'aobx-status-message__copy';
  copy.append(createBoundCopy('aobx-status-message__text', presentation.message));
  if (presentation.guidance) {
    copy.append(createBoundCopy('aobx-status-message__guidance', presentation.guidance));
  }

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'aobx-status-message__retry';
  autoSaveState.bindings.push(bindLocalizedText(retry, presentation.retryLabel));
  retry.addEventListener('click', () => {
    if (retry.disabled) return;
    retry.disabled = true;
    retry.setAttribute('aria-busy', 'true');
    void presentation
      .retry()
      .catch(() => undefined)
      .finally(() => {
        if (autoSaveState.version !== version || !retry.isConnected) return;
        retry.disabled = false;
        retry.removeAttribute('aria-busy');
      });
  });
  lane.replaceChildren(copy, retry);
}

export function clearAutoSaveFailureLane(): void {
  autoSaveState.version += 1;
  disposeAutoSaveBindings();
  const lane = getOptionalElementById<HTMLElement>('msg')?.querySelector<HTMLElement>(
    '[data-message-lane="autosave"]'
  );
  if (!lane) return;
  lane.replaceChildren();
  lane.hidden = true;
  lane.removeAttribute('role');
  lane.removeAttribute('aria-live');
  lane.removeAttribute('aria-atomic');
}

function getLane(name: 'general' | 'autosave'): HTMLElement {
  const host = getOptionalElementById<HTMLElement>('msg') ?? createHost();
  host.classList.add('aobx-status-message');
  let lane = host.querySelector<HTMLElement>(`[data-message-lane="${name}"]`);
  if (!lane) {
    lane = document.createElement('div');
    lane.dataset.messageLane = name;
    lane.hidden = true;
    host.append(lane);
  }
  return lane;
}

function createHost(): HTMLElement {
  const host = document.createElement('div');
  host.id = 'msg';
  host.className = 'aobx-status-message';
  document.body.append(host);
  return host;
}

function createBoundCopy(className: string, content: StatusMessageContent): HTMLElement {
  const element = document.createElement('span');
  element.className = className;
  autoSaveState.bindings.push(bindLocalizedText(element, content));
  return element;
}

function clearGeneralLane(lane: HTMLElement): void {
  generalState.binding?.dispose();
  generalState.binding = null;
  generalState.timer = undefined;
  delete lane.dataset.i18n;
  lane.textContent = '';
  lane.hidden = true;
  if (lane.parentElement) lane.parentElement.className = 'aobx-status-message';
}

function disposeAutoSaveBindings(): void {
  autoSaveState.bindings.forEach((binding) => binding.dispose());
  autoSaveState.bindings = [];
}
