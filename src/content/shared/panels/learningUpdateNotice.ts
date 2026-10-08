import { getService, TOKENS } from '@shared/di';
import type { PlatformServices } from '@platform/types';
import { createPrimitiveButtonElement } from '@ui/primitives/button';
import { RUNTIME_SURFACE_FALLBACK_MESSAGES } from '@i18n/catalog/runtimeSurfaceFallbackMessages';
import {
  getContentI18nBinder,
  createContentI18nTranslator,
  getContentI18nResource
} from '../../i18n/context';
import {
  LEARNING_UPDATE_AVAILABLE_KEY,
  LEARNING_UPDATE_DISMISSED_KEY
} from '@shared/learningUpdateNotice';

/** A non-modal notice: it never changes capture state, focus or lesson progress. */
export function bindLearningUpdateNotice(
  root: HTMLElement,
  platform?: {
    storage: Pick<PlatformServices['storage'], 'local'>;
    runtime: Pick<PlatformServices['runtime'], 'getURL'>;
  }
): () => void {
  const panel = root.querySelector<HTMLElement>(
    '.clipper-surface-window, .reader-surface-window, .video-surface-window'
  );
  if (!panel) return () => {};
  const services = platform ?? getService<PlatformServices>(TOKENS.platformServices);
  const storage = services.storage.local;
  const doc = root.ownerDocument;
  const notice = doc.createElement('aside');
  notice.className = 'learning-update-notice';
  notice.setAttribute('role', 'note');
  notice.hidden = true;
  const title = doc.createElement('strong');
  const description = doc.createElement('p');
  const actions = doc.createElement('div');
  actions.className = 'learning-update-actions';
  const link = doc.createElement('a');
  link.className = 'btn primary';
  link.dataset.role = 'learning-update-start';
  link.href = services.runtime.getURL('onboarding/index.html');
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const close = createPrimitiveButtonElement({
    label: '',
    classSlots: ['btn', 'ghost'],
    dataRole: 'learning-update-dismiss'
  });
  const error = doc.createElement('p');
  error.className = 'learning-update-error';
  error.setAttribute('role', 'status');
  error.hidden = true;
  const t = createContentI18nTranslator(getContentI18nResource());
  const text = (
    key:
      | 'learningUpdateTitle'
      | 'learningUpdateDescription'
      | 'learningUpdateStart'
      | 'learningUpdateDismiss'
      | 'learningUpdateSaveError'
  ) => t?.(key, RUNTIME_SURFACE_FALLBACK_MESSAGES[key]) ?? RUNTIME_SURFACE_FALLBACK_MESSAGES[key];
  title.textContent = text('learningUpdateTitle');
  description.textContent = text('learningUpdateDescription');
  link.textContent = text('learningUpdateStart');
  close.textContent = text('learningUpdateDismiss');
  error.textContent = text('learningUpdateSaveError');
  const binder = getContentI18nBinder();
  const bindings = [
    binder?.bindText(title, 'learningUpdateTitle'),
    binder?.bindText(description, 'learningUpdateDescription'),
    binder?.bindText(link, 'learningUpdateStart'),
    binder?.bindText(close, 'learningUpdateDismiss'),
    binder?.bindText(error, 'learningUpdateSaveError')
  ];
  actions.append(link, close);
  notice.append(title, description, actions, error);
  panel.insertBefore(notice, panel.children[1] ?? null);
  let disposed = false;
  let available = false;
  let dismissed = false;
  let saving = false;
  function refresh() {
    if (disposed) return;
    notice.hidden = !available || dismissed;
    root.toggleAttribute('data-learning-update', !notice.hidden);
  }
  async function acknowledge(event: MouseEvent) {
    event.stopPropagation();
    if (disposed || saving) return;
    saving = true;
    close.disabled = true;
    error.hidden = true;
    try {
      await storage.set(LEARNING_UPDATE_DISMISSED_KEY, true);
      dismissed = true;
      refresh();
    } catch (cause) {
      if (!disposed) error.hidden = false;
      console.warn('[learning] Failed to save tutorial acknowledgement:', cause);
    } finally {
      saving = false;
      close.disabled = false;
    }
  }
  const onAcknowledge = (event: MouseEvent) => {
    void acknowledge(event);
  };
  // Keep the anchor's native new-tab navigation and user gesture.
  link.addEventListener('click', onAcknowledge);
  close.addEventListener('click', onAcknowledge);
  const stopAvailable = storage.watchKey(LEARNING_UPDATE_AVAILABLE_KEY, (value) => {
    available = value === true;
    refresh();
  });
  const stopDismissed = storage.watchKey(LEARNING_UPDATE_DISMISSED_KEY, (value) => {
    if (value === true) dismissed = true;
    refresh();
  });
  void storage
    .getMany([LEARNING_UPDATE_AVAILABLE_KEY, LEARNING_UPDATE_DISMISSED_KEY])
    .then((values) => {
      available = available || values[LEARNING_UPDATE_AVAILABLE_KEY] === true;
      dismissed = dismissed || values[LEARNING_UPDATE_DISMISSED_KEY] === true;
      refresh();
    })
    .catch((cause) => console.warn('[learning] Failed to read tutorial availability:', cause));
  return () => {
    disposed = true;
    stopAvailable();
    stopDismissed();
    link.removeEventListener('click', onAcknowledge);
    close.removeEventListener('click', onAcknowledge);
    root.removeAttribute('data-learning-update');
    bindings.forEach((binding) => binding?.dispose());
    notice.remove();
  };
}
