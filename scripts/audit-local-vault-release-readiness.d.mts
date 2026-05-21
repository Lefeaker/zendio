export interface LocalVaultReleaseReadinessResult {
  distDir: string;
  expectedBrowser: 'chrome' | 'firefox' | null;
  builtBrowser: 'chrome' | 'firefox';
  requiredFiles: string[];
  chromeOffscreenPermission: boolean;
  firefoxOffscreenPermission: boolean;
  builtWarMatches: string[];
  chromeWarMatches: string[];
  firefoxWarMatches: string[];
  lazyPromptChunk: string;
}

export interface LocalVaultReleaseReadinessOptions {
  distDir?: string;
  browser?: 'chrome' | 'firefox';
}

export function auditLocalVaultReleaseReadiness(
  options?: LocalVaultReleaseReadinessOptions
): Promise<LocalVaultReleaseReadinessResult>;
