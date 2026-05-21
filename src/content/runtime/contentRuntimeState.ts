import type { FragmentClipperOptions } from '../../shared/types/options';
import {
  DEFAULT_FRAGMENT_CONFIG,
  createModifierState,
  loadFragmentConfig,
  resetModifierState,
  type ModifierState
} from '../clipper/services/fragmentConfig';
import type { SelectionSnapshot } from './contentSelectionTracker';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';

export type ContentClipMode = 'full' | 'selection';

export interface ContentRuntimeState {
  getClipMode(): ContentClipMode;
  setClipMode(mode: ContentClipMode): void;
  getFragmentClipperConfig(): FragmentClipperOptions;
  getAutoSelectionInFlight(): boolean;
  setAutoSelectionInFlight(value: boolean): void;
  getModifierState(): ModifierState;
  isSelectionModifierActive(): boolean;
  setSelectionModifierActive(value: boolean): void;
  getLastSelectionSnapshot(): SelectionSnapshot | null;
  setLastSelectionSnapshot(snapshot: SelectionSnapshot | null): void;
  resetSelectionTracking(): void;
  startOptionsLifecycle(): void;
  stopOptionsLifecycle(): void;
  refreshFragmentConfig(): Promise<void>;
}

export interface CreateContentRuntimeStateOptions {
  optionsRepository: IOptionsRepository;
  window: Window;
}

export function createContentRuntimeState(
  options: CreateContentRuntimeStateOptions
): ContentRuntimeState {
  const { window } = options;
  const optionsRepository = options.optionsRepository;
  let clipMode: ContentClipMode = 'full';
  let fragmentClipperConfig = DEFAULT_FRAGMENT_CONFIG;
  let autoSelectionInFlight = false;
  const modifierState = createModifierState();
  let selectionModifierActive = false;
  let lastSelectionSnapshot: SelectionSnapshot | null = null;
  let stopOptionsSubscription: (() => void) | null = null;

  const startOptionsSubscription = (): void => {
    if (stopOptionsSubscription) {
      return;
    }
    stopOptionsSubscription = optionsRepository.onChange(() => {
      void refreshFragmentConfig();
    });
  };

  const stopOptionsSubscriptionIfNeeded = (): void => {
    stopOptionsSubscription?.();
    stopOptionsSubscription = null;
  };

  async function refreshFragmentConfig(): Promise<void> {
    try {
      fragmentClipperConfig = await loadFragmentConfig(optionsRepository);
    } catch (error) {
      console.warn('[content] Failed to refresh fragment clipper config:', error);
      fragmentClipperConfig = DEFAULT_FRAGMENT_CONFIG;
    }
    if (!fragmentClipperConfig.selectionModifierEnabled) {
      selectionModifierActive = false;
      resetModifierState(modifierState);
    }
  }

  const resumeOptionsSubscription = (): void => {
    startOptionsSubscription();
    void refreshFragmentConfig();
  };

  const handlePageHide = (): void => {
    stopOptionsSubscriptionIfNeeded();
  };

  function startOptionsLifecycle(): void {
    startOptionsSubscription();
    void optionsRepository
      .get()
      .then(() => refreshFragmentConfig())
      .catch((error) => {
        console.warn('[content] Failed to preload fragment config from options store:', error);
      });

    window.addEventListener('pageshow', resumeOptionsSubscription, { passive: true });
    window.addEventListener('pagehide', handlePageHide, { passive: true });
  }

  function stopOptionsLifecycle(): void {
    stopOptionsSubscriptionIfNeeded();
    window.removeEventListener('pageshow', resumeOptionsSubscription);
    window.removeEventListener('pagehide', handlePageHide);
  }

  function resetSelectionTracking(): void {
    resetModifierState(modifierState);
    selectionModifierActive = false;
    lastSelectionSnapshot = null;
  }

  return {
    getClipMode: () => clipMode,
    setClipMode: (mode) => {
      clipMode = mode;
    },
    getFragmentClipperConfig: () => fragmentClipperConfig,
    getAutoSelectionInFlight: () => autoSelectionInFlight,
    setAutoSelectionInFlight: (value) => {
      autoSelectionInFlight = value;
    },
    getModifierState: () => modifierState,
    isSelectionModifierActive: () => selectionModifierActive,
    setSelectionModifierActive: (value) => {
      selectionModifierActive = value;
    },
    getLastSelectionSnapshot: () => lastSelectionSnapshot,
    setLastSelectionSnapshot: (snapshot) => {
      lastSelectionSnapshot = snapshot;
    },
    resetSelectionTracking,
    startOptionsLifecycle,
    stopOptionsLifecycle,
    refreshFragmentConfig
  };
}
