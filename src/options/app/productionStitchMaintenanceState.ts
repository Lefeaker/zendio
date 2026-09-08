import type { PreviewContent } from '@options/stitch/types';
import type { SectionInvalidationAcknowledgement } from '@ui/stitch-runtime/render/sectionInvalidation';
import type { SectionInvalidationFailure } from '@ui/stitch-runtime/render/sectionInvalidation';

export type ProductionMaintenanceDiagnosisState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'success'; report: string }
  | { status: 'failure' };
export type ProductionMaintenanceActionSource = 'copy' | 'import' | 'repair' | 'reload';

export interface ProductionMaintenanceActionNotice {
  source: ProductionMaintenanceActionSource;
  outcome: 'success' | 'failure';
  message?: string;
}

export interface ProductionMaintenanceSnapshot {
  diagnosis: ProductionMaintenanceDiagnosisState;
  lastActionNotice: ProductionMaintenanceActionNotice | null;
}
export interface ProductionMaintenanceRunDiagnosisOptions {
  buildReport(): string;
  isActive(): boolean;
  renderFinal(): void;
  renderRunning(): Promise<SectionInvalidationAcknowledgement>;
}

export interface ProductionStitchMaintenanceState {
  bind(appData: PreviewContent): void;
  dispose(this: void): void;
  getLegacyLog(): string;
  getSnapshot(): ProductionMaintenanceSnapshot;
  runDiagnosis(this: void, options: ProductionMaintenanceRunDiagnosisOptions): void;
  setActionNotice(this: void, notice: ProductionMaintenanceActionNotice): void;
  waitForIdle(this: void): Promise<void>;
}

export async function reloadProductionMaintenance<T>(
  load: () => Promise<T>,
  isActive: () => boolean,
  refresh: (value: T) => void,
  setNotice: (notice: ProductionMaintenanceActionNotice) => void,
  track: (outcome: 'completed' | 'failed') => void
): Promise<void> {
  try {
    const loaded = await load();
    if (!isActive()) return;
    setNotice({ source: 'reload', outcome: 'success' });
    refresh(loaded);
    track('completed');
  } catch (error) {
    if (isActive()) {
      setNotice({ source: 'reload', outcome: 'failure' });
      track('failed');
    }
    throw error;
  }
}

interface MaintenanceRuntimeBridge<T> {
  disposeMaintenance(): void;
  refreshOptions(this: void, value: T): void;
  render(scope: 'maintenance'): void;
  renderAndWait(scope: 'maintenance'): Promise<SectionInvalidationAcknowledgement>;
  runMaintenanceDiagnosis: ProductionStitchMaintenanceState['runDiagnosis'];
  setMaintenanceActionNotice(this: void, notice: ProductionMaintenanceActionNotice): void;
  waitForMaintenanceIdle(): Promise<void>;
}

interface MaintenanceTaskOwner {
  dispose(): void;
  waitForIdle(): Promise<void>;
}

export function createProductionMaintenanceRuntime<T>(
  bridge: MaintenanceRuntimeBridge<T>,
  load: () => Promise<T>,
  taskOwner: MaintenanceTaskOwner,
  isActive: () => boolean,
  refresh: () => void,
  trackReload: (outcome: 'completed' | 'failed') => void
) {
  return {
    dispose(): void {
      taskOwner.dispose();
      bridge.disposeMaintenance();
    },
    reload: (): Promise<void> =>
      reloadProductionMaintenance(
        load,
        isActive,
        bridge.refreshOptions,
        bridge.setMaintenanceActionNotice,
        trackReload
      ),
    runDiagnosis: (buildReport: () => string): void => {
      bridge.runMaintenanceDiagnosis({
        buildReport,
        isActive,
        renderRunning: () => {
          refresh();
          return bridge.renderAndWait('maintenance');
        },
        renderFinal: () => {
          refresh();
          bridge.render('maintenance');
        }
      });
    },
    waitForIdle: async (): Promise<void> => {
      await Promise.all([taskOwner.waitForIdle(), bridge.waitForMaintenanceIdle()]);
    }
  };
}

const snapshotByAppData = new WeakMap<PreviewContent, ProductionMaintenanceSnapshot>();
function cloneSnapshot(snapshot: ProductionMaintenanceSnapshot): ProductionMaintenanceSnapshot {
  return {
    diagnosis: { ...snapshot.diagnosis },
    lastActionNotice: snapshot.lastActionNotice ? { ...snapshot.lastActionNotice } : null
  };
}

function yieldForPaint(signal: AbortSignal): Promise<'cancelled' | 'painted'> {
  return new Promise((resolve) => {
    let frame: number | null = null;
    let timer: number | null = null;
    let settled = false;
    const finish = (result: 'cancelled' | 'painted'): void => {
      if (settled) return;
      settled = true;
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      resolve(result);
    };
    const abort = (): void => finish('cancelled');
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) return abort();
    const scheduleTask = (): void => {
      frame = null;
      if (settled || signal.aborted) return abort();
      timer = window.setTimeout(() => {
        timer = null;
        finish(signal.aborted ? 'cancelled' : 'painted');
      }, 0);
    };
    if (typeof requestAnimationFrame === 'function') {
      frame = requestAnimationFrame(scheduleTask);
      return;
    }
    scheduleTask();
  });
}

export function resolveProductionMaintenanceSnapshot(
  appData: PreviewContent
): ProductionMaintenanceSnapshot | null {
  return snapshotByAppData.get(appData) ?? null;
}

export function createProductionStitchMaintenanceState(): ProductionStitchMaintenanceState {
  let snapshot: ProductionMaintenanceSnapshot = {
    diagnosis: { status: 'idle' },
    lastActionNotice: null
  };
  let activeTask: Promise<void> | null = null;
  let activeController: AbortController | null = null;
  let disposed = false;
  let generation = 0;
  function updateDiagnosis(diagnosis: ProductionMaintenanceDiagnosisState): void {
    snapshot = { ...snapshot, diagnosis };
  }
  function runDiagnosis(options: ProductionMaintenanceRunDiagnosisOptions): void {
    if (disposed || activeTask) return;
    const taskGeneration = ++generation;
    const controller = new AbortController();
    activeController = controller;
    updateDiagnosis({ status: 'running' });
    let startTask!: () => void;
    const taskStart = new Promise<void>((resolve) => (startTask = resolve));
    const task = taskStart.then(async () => {
      try {
        let acknowledgement: SectionInvalidationAcknowledgement;
        const cancelled = new Promise<SectionInvalidationAcknowledgement>((resolve) => {
          const cancel = (): void => resolve({ status: 'cancelled' });
          controller.signal.addEventListener('abort', cancel, { once: true });
          if (controller.signal.aborted) cancel();
        });
        try {
          acknowledgement = await Promise.race([options.renderRunning(), cancelled]);
        } catch (error) {
          acknowledgement = { status: 'failed', error: error as SectionInvalidationFailure };
        }
        const isCurrent = (): boolean =>
          !controller.signal.aborted &&
          !disposed &&
          taskGeneration === generation &&
          options.isActive();
        if (!isCurrent() || acknowledgement.status === 'cancelled') return;
        if (acknowledgement.status === 'failed') {
          updateDiagnosis({ status: 'failure' });
          try {
            options.renderFinal();
          } catch {
            // Failure publication is best-effort; acknowledgement remains authoritative.
          }
          return;
        }
        if ((await yieldForPaint(controller.signal)) === 'cancelled' || !isCurrent()) return;
        try {
          updateDiagnosis({ status: 'success', report: options.buildReport() });
        } catch {
          updateDiagnosis({ status: 'failure' });
        }
        if (isCurrent()) options.renderFinal();
      } finally {
        if (activeTask === task) {
          activeTask = null;
          if (activeController === controller) activeController = null;
        }
      }
    });
    activeTask = task;
    startTask();
  }
  return {
    bind(appData): void {
      snapshotByAppData.set(appData, cloneSnapshot(snapshot));
    },
    dispose(): void {
      disposed = true;
      generation += 1;
      activeController?.abort();
    },
    getLegacyLog: (): string =>
      snapshot.diagnosis.status === 'success' ? snapshot.diagnosis.report : '',
    getSnapshot: (): ProductionMaintenanceSnapshot => cloneSnapshot(snapshot),
    runDiagnosis,
    setActionNotice(notice): void {
      snapshot = { ...snapshot, lastActionNotice: { ...notice } };
    },
    async waitForIdle(): Promise<void> {
      while (activeTask) await activeTask;
    }
  };
}
