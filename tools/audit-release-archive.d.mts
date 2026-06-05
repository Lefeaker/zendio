export function auditReleaseArchive(
  archivePath: string,
  options?: {
    keepTemp?: boolean;
    logger?: Pick<Console, 'log' | 'error'>;
  }
): Promise<void>;
