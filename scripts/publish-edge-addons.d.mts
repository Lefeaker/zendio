import type { VerifiedChromeArtifactBinding } from './utils/releaseArtifactManifest.mjs';

export const EDGE_LIMITS: Readonly<
  Record<
    | 'responseBytes'
    | 'uploadMs'
    | 'publishMs'
    | 'requestMs'
    | 'pollMs'
    | 'pollAttempts'
    | 'intervalMs',
    number
  >
>;
export function readEdgeConfig(environment?: NodeJS.ProcessEnv): {
  clientId: string;
  apiKey: string;
  productId: string;
};
export function edgeOperationId(location: string | null, endpoint: string): string;
export function edgeCertificationNotes(version: string): string;
export function publishVerifiedEdgeRelease(
  options: {
    binding: VerifiedChromeArtifactBinding;
    stateFile: string;
    environment?: NodeJS.ProcessEnv;
  },
  dependencies?: {
    fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
    sleep?: (milliseconds: number) => Promise<void>;
    now?: () => number;
  }
): Promise<{ terminalResult: string; uploadOperationId: string; publishOperationId: string }>;
export function runEdgeAddonsCli(
  argv?: string[],
  environment?: NodeJS.ProcessEnv
): Promise<unknown>;
