import type { DownloadsService } from '../../platform/interfaces/downloads';
import type { StorageAreaService } from '../../platform/interfaces/storage';
import type { PlatformServices } from '../../platform/types';
import { getService, TOKENS } from '../../shared/di';
import {
  LEARNING_PROGRESS_KEY,
  LearningProgressSchema,
  emptyLearningProgress,
  type LearningCourse,
  type LearningProgress,
  type LearningReceipt
} from '../../shared/learningProgress';
import type { ClipPayload } from '../../shared/types';

export interface LearningExport {
  receipt: LearningReceipt;
  courses: LearningCourse[];
  downloadIds: Array<number | string>;
}

export function learningCoursesForExport(
  payload: ClipPayload,
  attachmentCount: number
): LearningCourse[] {
  if (payload.type === 'video') {
    return Number(payload.meta?.timestampCount) > 0 && attachmentCount > 0 ? ['video'] : [];
  }
  if (payload.type === 'ai_chat') return ['chat'];
  if (payload.meta?.readerMode) return Number(payload.meta.highlightCount) >= 2 ? ['reader'] : [];
  if (payload.type === 'fragment' || payload.type === 'clipper') return ['fragment'];
  return ['article'];
}

/** Sole writer for learning results. UI preferences and business drafts remain separate. */
export function createLearningProgressStore(
  storage: StorageAreaService,
  downloads: DownloadsService
) {
  let queue = Promise.resolve();
  const run = (action: () => Promise<void>) => {
    const next = queue.then(action);
    queue = next.catch(() => undefined);
    return next;
  };
  const read = async () => {
    const raw = await storage.get(LEARNING_PROGRESS_KEY);
    return LearningProgressSchema.parse(raw ?? emptyLearningProgress());
  };
  const write = (state: LearningProgress) => storage.set(LEARNING_PROGRESS_KEY, state);
  const complete = (
    state: LearningProgress,
    receipt: LearningReceipt,
    courses: LearningCourse[]
  ) => {
    for (const course of courses) state.completed[course] ??= receipt;
    if (receipt.destination === 'vault') state.completed.vault ??= receipt;
    if (!state.latest || receipt.savedAt >= state.latest.savedAt) state.latest = receipt;
  };
  const reconcile = () =>
    run(async () => {
      const state = await read();
      const inspect = downloads.inspect?.bind(downloads);
      if (!inspect || state.pending.length === 0) return;
      let changed = false;
      for (const pending of [...state.pending]) {
        if (pending.failed) continue;
        const items = await Promise.all(pending.downloadIds.map((id) => inspect(id)));
        if (items.some((item) => !item || item.state === 'interrupted')) {
          pending.failed = true;
          changed = true;
        } else if (items.every((item) => item?.state === 'complete')) {
          const markdown = items[items.length - 1];
          complete(
            state,
            { ...pending.receipt, filePath: markdown?.filename ?? pending.receipt.filePath },
            pending.courses
          );
          state.pending = state.pending.filter((item) => item !== pending);
          changed = true;
        }
      }
      if (changed) await write(state);
    });
  return {
    async record(input: LearningExport): Promise<void> {
      await run(async () => {
        const state = await read();
        if (input.receipt.destination === 'vault') {
          complete(state, input.receipt, input.courses);
        } else {
          state.pending = state.pending.filter(
            (item) => item.receipt.operationId !== input.receipt.operationId && !item.failed
          );
          // A missing ID cannot prove a completed download. Retain a visible failure instead.
          state.pending.push({ ...input, ...(input.downloadIds.length ? {} : { failed: true }) });
        }
        await write(state);
      });
      await reconcile();
    },
    reconcile,
    start(): () => void {
      const stop = downloads.onChanged?.(() => {
        void reconcile().catch((error) =>
          console.warn('[learning] Download reconciliation failed:', error)
        );
      });
      void reconcile().catch((error) =>
        console.warn('[learning] Progress recovery failed:', error)
      );
      return () => stop?.();
    }
  };
}

let store: ReturnType<typeof createLearningProgressStore> | undefined;
export function initializeLearningProgress(
  platform: Pick<PlatformServices, 'storage' | 'downloads'>
): void {
  store = createLearningProgressStore(platform.storage.local, platform.downloads);
  store.start();
}

export async function recordLearningExport(input: LearningExport): Promise<void> {
  try {
    if (!store) initializeLearningProgress(getService<PlatformServices>(TOKENS.platformServices));
    await store?.record(input);
  } catch (error) {
    // The note has already been written. A learning failure must never ask users to export it again.
    console.warn('[learning] Could not record export progress:', error);
  }
}
