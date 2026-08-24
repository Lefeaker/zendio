import type {
  FirefoxReleaseArtifactBinding,
  FirefoxReleaseTransportMode
} from './firefoxReleaseArtifactManifest.mjs';

export const FIREFOX_AMO_API_BASE_URL: 'https://addons.mozilla.org/api/v5/';
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
}>;

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
      beforeMutation(operation: 'upload', metadata: Record<string, unknown>): Promise<void>;
      afterMutation(operation: 'upload', metadata: Record<string, unknown>): Promise<void>;
    };
  },
  dependencies: {
    signAddonImpl: (options: Record<string, unknown>) => Promise<unknown>;
    SubmitClient?: new (...args: never[]) => unknown;
  }
): Promise<unknown>;
