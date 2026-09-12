import type { ExportDestinationMetadata } from '@shared/exportDestination';

export type VideoDestinationBootstrap =
  | { provenance: 'implicit-default' }
  | { provenance: 'explicit'; destination: ExportDestinationMetadata };

export function resolveVideoDestinationBootstrap(
  destination: ExportDestinationMetadata | undefined,
  selectionIsExplicit: boolean | undefined
): VideoDestinationBootstrap {
  if (selectionIsExplicit === true) {
    if (!destination) throw new Error('VIDEO_DESTINATION_BOOTSTRAP_INVALID');
    return { provenance: 'explicit', destination };
  }
  if (selectionIsExplicit === false || !destination) {
    return { provenance: 'implicit-default' };
  }
  return { provenance: 'explicit', destination };
}

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
