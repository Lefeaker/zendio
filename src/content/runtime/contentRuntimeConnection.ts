import type { RuntimeService } from '../../platform/interfaces/runtime';
import { onExtensionContextInvalidated } from '../../platform/shared/extensionContext';
import {
  disposeSessionPanelRecovery,
  setSessionPanelRecovery
} from '../shared/panels/sessionPanelRecovery';

export function watchContentRuntimeConnection(options: {
  document: Document;
  window: Window;
  runtime: Pick<RuntimeService, 'isContextValid'>;
  disconnect(): void;
}): () => void {
  let disconnected = false;
  const disconnect = () => {
    if (disconnected) return;
    disconnected = true;
    options.document.documentElement.dataset.aiobContentRuntime = 'stale';
    try {
      options.disconnect();
    } finally {
      setSessionPanelRecovery(options.document, 'reader', 'reload');
      setSessionPanelRecovery(options.document, 'video', 'reload');
    }
  };
  const check = () => {
    if (disconnected) return;
    try {
      if (options.runtime.isContextValid?.() === false) disconnect();
    } catch {
      disconnect();
    }
  };
  const unsubscribe = onExtensionContextInvalidated(disconnect);
  options.window.addEventListener('focus', check, true);
  options.window.addEventListener('pointerdown', check, true);
  options.window.addEventListener('keydown', check, true);
  options.document.addEventListener('visibilitychange', check);
  return () => {
    unsubscribe();
    options.window.removeEventListener('focus', check, true);
    options.window.removeEventListener('pointerdown', check, true);
    options.window.removeEventListener('keydown', check, true);
    options.document.removeEventListener('visibilitychange', check);
    disposeSessionPanelRecovery(options.document);
  };
}
