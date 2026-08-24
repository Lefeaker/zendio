export function auditReleaseArchive(
  archivePath: string,
  options?: {
    readonly keepTemp?: boolean;
    readonly logger?: Pick<Console, 'log' | 'error'>;
  }
): Promise<void>;
