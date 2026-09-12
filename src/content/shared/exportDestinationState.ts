import {
  buildExportDestinationPreview,
  createExportDestinationMetadata,
  parseExportDestinationMetadata,
  parseExportDestinationId,
  type ExportDestinationMetadata,
  type ExportDestinationSelection
} from '@shared/exportDestination';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { ClipPayload, CompleteOptions } from '@shared/types';
import type { ExportDestinationSurfacePreview } from '@ui/stitch-runtime';
import { mergeOptions } from '@shared/config/optionsMerger';
import { patchExportDestinationRow } from './exportDestinationDom';

interface DestinationRefreshResult {
  applied: boolean;
  preview: ExportDestinationSurfacePreview | undefined;
}

const selectionActivationPreviews = new WeakSet<ExportDestinationSurfacePreview>();

function markSelectionActivation(
  preview: ExportDestinationSurfacePreview | undefined,
  selectionActivated: boolean
): ExportDestinationSurfacePreview | undefined {
  if (!preview || !selectionActivated) return preview;
  const renderAttemptPreview = { ...preview };
  selectionActivationPreviews.add(renderAttemptPreview);
  return renderAttemptPreview;
}

export function reconcileLiveExportDestinationRow(
  root: ParentNode,
  destination: ExportDestinationSurfacePreview | undefined
): boolean {
  const selectionActivated = destination ? selectionActivationPreviews.delete(destination) : false;
  return patchExportDestinationRow(root, destination, selectionActivated);
}

export class ContentExportDestinationState {
  private selection: ExportDestinationSelection | null = null;
  private selectionIsExplicit = false;
  private preview: ExportDestinationSurfacePreview | undefined;
  private refreshTail: Promise<void> = Promise.resolve();
  private latestRefreshRevision = 0;
  private activeWatchRevision = 0;
  private stopOptionsWatch: (() => void) | null = null;
  private selectionRenderPending = false;

  constructor(
    private readonly optionsRepository: IOptionsRepository,
    private readonly createPayload: () => ClipPayload,
    private readonly setupUrl?: string
  ) {}

  get currentPreview(): ExportDestinationSurfacePreview | undefined {
    return this.preview;
  }

  get metadata(): ExportDestinationMetadata | undefined {
    return this.selection ? createExportDestinationMetadata(this.selection) : undefined;
  }

  get hasExplicitSelection(): boolean {
    return this.selectionIsExplicit;
  }

  async refresh(): Promise<ExportDestinationSurfacePreview | undefined> {
    return (await this.scheduleRefresh(() => this.optionsRepository.get())).preview;
  }

  async startWatching(
    listener: (preview: ExportDestinationSurfacePreview | undefined) => void
  ): Promise<void> {
    this.watch(listener);
    const watchRevision = this.activeWatchRevision;
    const result = await this.scheduleRefresh(() => this.optionsRepository.get());
    if (result.applied && this.activeWatchRevision === watchRevision) {
      this.notify(listener, result.preview);
    }
  }

  watch(listener: (preview: ExportDestinationSurfacePreview | undefined) => void): () => void {
    this.stopWatching();
    const watchRevision = ++this.activeWatchRevision;
    const stopRepositoryWatch = this.optionsRepository.onChange((options) => {
      void this.scheduleRefresh(() => Promise.resolve(options)).then((result) => {
        if (result.applied && this.activeWatchRevision === watchRevision) {
          this.notify(listener, result.preview);
        }
      });
    });
    let stopped = false;
    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      stopRepositoryWatch();
      if (this.activeWatchRevision === watchRevision) {
        this.activeWatchRevision += 1;
        this.stopOptionsWatch = null;
      }
    };
    this.stopOptionsWatch = stop;
    return stop;
  }

  dispose(): void {
    this.stopWatching();
  }

  private stopWatching(): void {
    this.stopOptionsWatch?.();
    this.stopOptionsWatch = null;
  }

  private scheduleRefresh(
    loadOptions: () => Promise<CompleteOptions>
  ): Promise<DestinationRefreshResult> {
    const revision = ++this.latestRefreshRevision;
    const selectionActivated = this.selectionRenderPending;
    this.selectionRenderPending = false;
    const operation = this.refreshTail.then(async (): Promise<DestinationRefreshResult> => {
      let options: CompleteOptions;
      try {
        options = mergeOptions(await loadOptions());
      } catch (error) {
        if (revision === this.latestRefreshRevision) {
          console.warn('[ExportDestination] Failed to refresh destination preview:', error);
        }
        return {
          applied: false,
          preview: markSelectionActivation(this.preview, selectionActivated)
        };
      }
      if (revision !== this.latestRefreshRevision) {
        return {
          applied: false,
          preview: markSelectionActivation(this.preview, selectionActivated)
        };
      }

      try {
        const requestedSelection = this.selectionIsExplicit ? this.selection : null;
        let preview = buildExportDestinationPreview({
          options,
          payload: this.createPayload(),
          selection: requestedSelection,
          ...(this.setupUrl ? { setupUrl: this.setupUrl } : {})
        });
        if (requestedSelection?.kind === 'vault' && preview.kind === 'downloads') {
          preview = buildExportDestinationPreview({
            options,
            payload: this.createPayload(),
            selection: null,
            ...(this.setupUrl ? { setupUrl: this.setupUrl } : {})
          });
          this.selectionIsExplicit = false;
        }
        this.preview = preview;
        this.selection = parseExportDestinationId(preview.id);
        return {
          applied: true,
          preview: markSelectionActivation(preview, selectionActivated)
        };
      } catch (error) {
        console.warn('[ExportDestination] Failed to build destination preview:', error);
        return {
          applied: false,
          preview: markSelectionActivation(this.preview, selectionActivated)
        };
      }
    });
    this.refreshTail = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  private notify(
    listener: (preview: ExportDestinationSurfacePreview | undefined) => void,
    preview: ExportDestinationSurfacePreview | undefined
  ): void {
    try {
      listener(preview);
    } catch (error) {
      console.warn('[ExportDestination] Destination listener failed:', error);
    }
  }

  select(id: string): void {
    this.selection = parseExportDestinationId(id);
    this.selectionIsExplicit = true;
    this.selectionRenderPending = true;
  }

  applyMetadata(metadata: ExportDestinationMetadata | undefined): void {
    const selection = parseExportDestinationMetadata(metadata);
    if (selection) {
      this.selection = selection;
      this.selectionIsExplicit = true;
    }
  }
}
