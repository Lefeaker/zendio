import type { FirefoxReleaseArtifactBinding } from './firefoxReleaseArtifactManifest.mjs';

export const FIREFOX_AMO_STATE_LIMIT: number;
export function submitFirefoxAmoReleaseCore(options: {
  binding: FirefoxReleaseArtifactBinding;
  manifestPath: string;
  stateFile: string;
  savedUploadUuidPath: string;
  downloadDir: string;
  channel: 'listed' | 'unlisted';
  credentials: { apiKey: string; apiSecret: string };
}): Promise<Readonly<{ result: unknown; state: Record<string, unknown> }>>;
