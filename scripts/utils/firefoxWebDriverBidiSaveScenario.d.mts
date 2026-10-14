export type FirefoxSaveScenarioResult = Readonly<{
  scenario: 'save-retry-v1';
  destination: 'loopback-rest-fixture';
  rejectedWrites: number;
  acceptedWrites: number;
  draftRetained: true;
  retrySaved: true;
  reopenedSaved: true;
  savedFiles: number;
  outputs: Array<{ file: string; bytes: number; sha256: string }>;
}>;

export function runFirefoxSaveRetryScenario(options: {
  request: (
    method: string,
    path: string,
    body?: { script?: string; args?: unknown[]; url?: string; type?: string; handle?: string }
  ) => Promise<unknown>;
  extensionUrl: string;
  outputDirectory: string;
  run: (operation: () => Promise<void>, timeoutMs: number, code: string) => Promise<void>;
  sleep: (milliseconds: number) => Promise<void>;
}): Promise<FirefoxSaveScenarioResult>;
