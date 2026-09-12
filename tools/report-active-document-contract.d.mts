export type ActiveDocumentStatus = 'active' | 'historical' | 'fixture';
export type ActiveDocumentContractMode = 'report' | 'check';

export interface ActiveDocumentStatusRow {
  path: string;
  status: ActiveDocumentStatus;
}

export interface ActiveDocumentContractFinding {
  code: string;
  path?: string;
  rowIndex?: number;
  message: string;
}

export interface ActiveDocumentContractCounts {
  trackedMarkdown: number;
  classifiedDocuments: number;
  active: number;
  historical: number;
  fixture: number;
}

export interface ActiveDocumentContractReport {
  schemaVersion: 1;
  manifestPath: string;
  counts: ActiveDocumentContractCounts;
  findings: ActiveDocumentContractFinding[];
  ok: boolean;
}

export interface TrackedMarkdownEntry {
  mode: string;
  path: string;
  stage: string;
}

export const DOCUMENT_STATUSES: readonly ActiveDocumentStatus[];
export const MANIFEST_PATH: 'tools/active-document-status.json';
export const SCHEMA_VERSION: 1;

export function listTrackedMarkdown(repoRoot: string): TrackedMarkdownEntry[];
export function auditActiveDocumentContract(options?: {
  repoRoot?: string;
  manifestPath?: string;
}): ActiveDocumentContractReport;
export function parseActiveDocumentContractArgs(argv: string[]): ActiveDocumentContractMode;
export function runActiveDocumentContractCli(
  argv?: string[],
  options?: { repoRoot?: string }
): number;
