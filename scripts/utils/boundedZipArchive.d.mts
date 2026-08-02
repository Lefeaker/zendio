export interface BoundedZipEntry {
  readonly path: string;
  readonly directory: boolean;
  readonly compressionMethod: 0 | 8;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly crc32: number;
  readonly content: Buffer | null;
}

export interface BoundedZipInventory {
  readonly archivePath: string;
  readonly size: number;
  readonly entryCount: number;
  readonly entries: readonly BoundedZipEntry[];
}

export interface BoundedZipLimits {
  readonly archiveBytes: number;
  readonly entries: number;
  readonly encodedPathBytes: number;
  readonly compressedEntryBytes: number;
  readonly uncompressedEntryBytes: number;
  readonly totalUncompressedBytes: number;
  readonly compressionRatio: number;
  readonly openTimeoutMs: number;
  readonly entryIdleTimeoutMs: number;
  readonly entryDeadlineMs: number;
  readonly inventoryDeadlineMs: number;
  readonly closeDeadlineMs: number;
}

export interface BoundedZipOpenConstants {
  readonly O_RDONLY: number;
  readonly O_NONBLOCK: number;
  readonly O_NOFOLLOW: number | undefined;
}

export const BOUNDED_ZIP_LIMITS: Readonly<BoundedZipLimits>;
export function inventoryBoundedZip(
  archivePath: string,
  options?: { onEntry?: (entry: BoundedZipEntry) => void | Promise<void> },
  dependencies?: {
    closeSyncImpl?: typeof import('node:fs').closeSync;
    fstatSyncImpl?: typeof import('node:fs').fstatSync;
    lstatSyncImpl?: typeof import('node:fs').lstatSync;
    openSyncImpl?: (path: string, flags: number) => number;
    fsConstantsImpl?: BoundedZipOpenConstants;
  }
): Promise<BoundedZipInventory>;
export function readBoundedZipText(entry: BoundedZipEntry): Promise<string | null>;
