import { withRequestDeadline, type ActiveRequest } from '../shared/utils/requestDeadline';
import type { DownloadStatus, DownloadsService } from './interfaces/downloads';

export const DOWNLOAD_TIMEOUT_MS = 120_000;

type DownloadInspection = {
  state: DownloadStatus['state'];
  items: DownloadStatus[];
};

/** Shared terminal-state definition for current saves and historical learning receipts. */
export async function inspectDownloads(
  downloads: DownloadsService,
  ids: Array<number | string>
): Promise<DownloadInspection> {
  const inspect = downloads.inspect?.bind(downloads);
  if (!inspect || !ids.length) return { state: 'interrupted', items: [] };
  const items = await Promise.all(ids.map((id) => inspect(id)));
  if (items.some((item) => !item || item.state === 'interrupted')) {
    return { state: 'interrupted', items: [] };
  }
  const observed = items.filter((item): item is DownloadStatus => item !== undefined);
  return {
    state: observed.every((item) => item.state === 'complete') ? 'complete' : 'in_progress',
    items: observed
  };
}

/** Subscribe before inspecting, including changes delivered while an inspection is in flight. */
export function waitForDownloadCompletion(
  downloads: DownloadsService,
  id: number | string | undefined,
  request?: ActiveRequest
): Promise<DownloadStatus> {
  if (!request) {
    return withRequestDeadline(DOWNLOAD_TIMEOUT_MS, {}, (active) =>
      waitForDownloadCompletion(downloads, id, active)
    );
  }
  const subscribe = downloads.onChanged?.bind(downloads);
  if (id === undefined || !downloads.inspect || !subscribe) {
    return Promise.reject(new Error('Download completion cannot be confirmed.'));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let inspecting = false;
    let inspectAgain = false;
    let stop = () => {};
    const finish = (item?: DownloadStatus, error?: Error) => {
      if (settled) return;
      settled = true;
      request.signal.removeEventListener('abort', interrupted);
      stop();
      if (item) resolve(item);
      else reject(error ?? new Error('Download was interrupted.'));
    };
    const interrupted = () => {
      if (settled) return;
      // Only this operation's ID is cancelled. Cancellation never proves absence.
      void downloads.cancel?.(id).catch(() => undefined);
      finish(undefined, request.signal.reason as Error);
    };
    request.signal.addEventListener('abort', interrupted, { once: true });
    const inspect = async () => {
      inspectAgain = true;
      if (inspecting || settled) return;
      inspecting = true;
      try {
        while (inspectAgain && !settled) {
          inspectAgain = false;
          const result = await inspectDownloads(downloads, [id]);
          request.check();
          if (result.state === 'complete') finish(result.items[0]);
          else if (result.state === 'interrupted') finish();
        }
      } catch (error) {
        finish(undefined, error instanceof Error ? error : new Error(String(error)));
      } finally {
        inspecting = false;
      }
    };
    if (request.signal.aborted) {
      interrupted();
      return;
    }
    try {
      request.check();
      stop = subscribe(() => {
        void inspect();
      });
      void inspect();
    } catch (error) {
      finish(undefined, error instanceof Error ? error : new Error(String(error)));
    }
  });
}
