export type FirefoxLintWarning = {
  code: string;
  message: string;
  file: string;
  line: number;
  column: number;
};

export type FirefoxLintProvenanceMapping = {
  code: string;
  message: string;
  source: string;
  line: number;
};

export const FIREFOX_LINT_PROVENANCE_FILE: 'firefox-lint-provenance.json';
export const FIREFOX_READABILITY_SOURCE_PATH: 'node_modules/@mozilla/readability/Readability.js';
export const FIREFOX_READABILITY_WARNING_CONTRACT: ReadonlyArray<
  Readonly<{
    code: 'UNSAFE_VAR_ASSIGNMENT';
    message: 'Unsafe assignment to innerHTML';
    source: typeof FIREFOX_READABILITY_SOURCE_PATH;
    line: 1549 | 1928;
  }>
>;

export function writeFirefoxLintProvenance(
  input: {
    distDir: string;
    buildConfig: Record<string, unknown>;
    repoRoot?: string;
  },
  dependencies?: Record<string, unknown>
): Promise<{ outputPath: string; provenance: Record<string, unknown> }>;

export function assertFirefoxLintProvenance(
  input: {
    distDir: string;
    warnings: FirefoxLintWarning[];
    repoRoot?: string;
  },
  dependencies?: Record<string, unknown>
): Promise<{ provenancePath: string; mappedWarnings: FirefoxLintProvenanceMapping[] }>;
