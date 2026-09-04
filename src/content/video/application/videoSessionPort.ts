import type { ExportDestinationMetadata } from '@shared/exportDestination';

export type VideoDestinationBootstrap =
  | { provenance: 'implicit-default' }
  | { provenance: 'explicit'; destination: ExportDestinationMetadata };

export interface VideoSessionStartOptions {
  initialCollapsed?: boolean;
  destinationBootstrap?: VideoDestinationBootstrap;
}

export interface VideoSessionAdapter {
  start(options?: VideoSessionStartOptions): Promise<void>;
  ingestTextCapture(
    selectedHtml: string,
    selectedText: string,
    comment: string,
    selectionRange?: Range | null
  ): void;
}
