import type {
  FirefoxReleaseArtifactBinding,
  FirefoxReleaseTransportMode
} from './firefoxReleaseArtifactManifest.mjs';

export const FIREFOX_AMO_API_BASE_URL: 'https://addons.mozilla.org/api/v5/';
export const FIREFOX_AMO_CLIENT_ID: 'direct-v5';
export const FIREFOX_SUBMISSION_LIMITS: Readonly<{
  uploadMs: 120000;
  submitMs: 120000;
  patchMs: 120000;
  statusMs: 30000;
  downloadMs: 120000;
  validationPollMs: 5000;
  validationAttempts: 120;
  validationTotalMs: 600000;
  approvalPollMs: 5000;
  approvalAttempts: 180;
  approvalTotalMs: 900000;
  wholeMs: 2700000;
  jsonResponseBytes: number;
  cumulativeResponseBytes: number;
  signedXpiBytes: number;
}>;
export const FIREFOX_SUBMISSION_MUTATIONS: readonly ['upload', 'version-submit', 'source-patch'];

export function hashVerifiedXpiCrcs(binding: FirefoxReleaseArtifactBinding): Promise<string>;
export function submitVerifiedFirefoxXpi(
  options: {
    binding: FirefoxReleaseArtifactBinding;
    transportMode: FirefoxReleaseTransportMode;
    channel: 'listed' | 'unlisted';
    id: string;
    amoBaseUrl: string;
    submissionSource: string;
    savedUploadUuidPath: string;
    downloadDir: string;
    credentials: { apiKey: string; apiSecret: string };
    mutationJournal: {
      beforeMutation(
        operation: 'upload' | 'version-submit' | 'source-patch',
        metadata: Readonly<Record<string, string>>
      ): Promise<void>;
      afterMutation(
        operation: 'upload' | 'version-submit' | 'source-patch',
        metadata: Readonly<Record<string, string>>
      ): Promise<void>;
      mutationInvoked(
        operation: 'upload' | 'version-submit' | 'source-patch',
        metadata: Readonly<Record<string, string>>
      ): Promise<void>;
    };
  },
  unsupportedInjection?: object
): Promise<unknown>;
