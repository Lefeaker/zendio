import {
  buildExportDestinationPreview,
  createExportDestinationMetadata,
  parseExportDestinationMetadata,
  parseExportDestinationId,
  type ExportDestinationMetadata,
  type ExportDestinationSelection
} from '@shared/exportDestination';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { ClipPayload } from '@shared/types';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';
import { mergeOptions } from '@shared/config/optionsMerger';

export class ContentExportDestinationState {
  private selection: ExportDestinationSelection | null = null;
  private preview: ExportDestinationSurfacePreview | undefined;

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

  async refresh(): Promise<ExportDestinationSurfacePreview | undefined> {
    try {
      const options = mergeOptions(await this.optionsRepository.get());
      this.preview = buildExportDestinationPreview({
        options,
        payload: this.createPayload(),
        selection: this.selection,
        ...(this.setupUrl ? { setupUrl: this.setupUrl } : {})
      });
      if (!this.selection) {
        this.selection = parseExportDestinationId(this.preview.id);
      }
      return this.preview;
    } catch (error) {
      console.warn('[ExportDestination] Failed to refresh destination preview:', error);
      this.preview = undefined;
      return undefined;
    }
  }

  select(id: string): void {
    this.selection = parseExportDestinationId(id);
  }

  applyMetadata(metadata: ExportDestinationMetadata | undefined): void {
    const selection = parseExportDestinationMetadata(metadata);
    if (selection) {
      this.selection = selection;
    }
  }
}
