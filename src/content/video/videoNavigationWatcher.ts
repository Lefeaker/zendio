export interface VideoNavigationWatcher {
  stop(): void;
}

export function watchVideoNavigation(doc: Document, onChange: () => void): VideoNavigationWatcher {
  const view = doc.defaultView;
  let stopped = false;
  let refreshTimer: number | null = null;

  const clearRefreshTimer = (): void => {
    if (refreshTimer === null) {
      return;
    }
    view?.clearTimeout(refreshTimer);
    refreshTimer = null;
  };

  const emitChange = (): void => {
    if (stopped) {
      return;
    }
    clearRefreshTimer();
    onChange();
  };

  const handleVisibilityChange = (): void => {
    if (doc.visibilityState === 'hidden') {
      return;
    }
    emitChange();
  };

  view?.addEventListener('popstate', emitChange, { passive: true });
  view?.addEventListener('pageshow', emitChange, { passive: true });
  doc.addEventListener('yt-navigate-finish', emitChange, { passive: true });
  doc.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

  return {
    stop(): void {
      stopped = true;
      clearRefreshTimer();
      view?.removeEventListener('popstate', emitChange);
      view?.removeEventListener('pageshow', emitChange);
      doc.removeEventListener('yt-navigate-finish', emitChange);
      doc.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}
