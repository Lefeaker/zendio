type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonRecord | JsonValue[];
type JsonRecord = { [key: string]: JsonValue };

interface TransitionManifest extends JsonRecord {
  readonly schema: JsonRecord;
  readonly base: JsonRecord;
  readonly runtime: JsonRecord;
  internalDigest: string;
  closureNodes: Array<{
    readonly key: string;
    readonly lockEntry: JsonRecord;
    adjacency: {
      dependencies: Array<{ resolvedKey: string; [key: string]: JsonValue }>;
      [key: string]: JsonValue;
    };
    [key: string]: JsonValue;
  }>;
  lockDelta: { addedKeys: string[]; [key: string]: JsonValue };
  counts: { addedKeys: number; [key: string]: JsonValue };
}
interface ImmutableTransition {
  readonly schema: JsonRecord;
  readonly base: { readonly head: string; readonly tree: string; [key: string]: JsonValue };
  readonly runtime: JsonRecord;
}
interface RuntimeInfo {
  readonly runtimePrefix: string;
  readonly realpath: string;
  readonly [key: string]: object | string | number | boolean | null | undefined;
}
interface AuditComparison {
  readonly ok: boolean;
  readonly failures?: readonly string[];
}

export function loadCanonicalJson(): Promise<{
  readonly canonicalJsonBytes: (value: JsonValue) => Buffer;
  readonly parseJsonBytesStrict: (bytes: Buffer, options?: { maximumDepth?: number }) => object;
  readonly readCanonicalJsonFileBounded: (path: string) => object;
  readonly assertPlainJson: (value: JsonValue, options: { path: string }) => void;
  readonly readFileBounded: (path: string, limitBytes: number) => Buffer;
}>;
export function loadTransitionValidator(): Promise<{
  readonly R02_TRANSITION_ARTIFACT_SHA256: string;
  readonly getR02ImmutableTransition: () => ImmutableTransition;
  readonly loadTransitionManifest: (
    path: string,
    expectedWholeSha256: string
  ) => TransitionManifest;
}>;
export function loadEvidenceChain(): Promise<{
  readonly R02_ORIGIN_PATHS: readonly string[];
  readonly writeFileExclusive: (
    path: string,
    data: string | Buffer,
    mode?: number,
    operations?: object
  ) => void;
  readonly durablePublishNoReplace: (path: string, data: string | Buffer, options?: object) => void;
  readonly ensureCleanTree: (root: string) => void;
  readonly assertRecordedCommitTree: (root: string, head: string, tree: string) => void;
  readonly assertSingleParentCommit: (root: string, head: string, expectedParent: string) => void;
  readonly rejectEvidenceAliases: (paths: string[]) => void;
  readonly assertTerminalCandidateTopology: (
    repo: object,
    parent: object,
    snapshot: object
  ) => void;
  readonly assertTerminalReanchorTopology: (repo: object, parent: object, snapshot: object) => void;
  readonly assertPortableRuntimeBinding: (binding: object) => void;
}>;
export function loadRuntimeDiscovery(): Promise<{
  readonly assertClosedRuntimeEnvironment: (environment: Record<string, string>) => void;
  readonly detectNpmCommand: (options: object) => RuntimeInfo;
  readonly revalidateRuntime: (info: RuntimeInfo) => void;
  readonly runNpmAudit: (options: object) => Promise<object>;
}>;
export function loadAuditReport(): Promise<{
  readonly assertAuditReportSchema: (report: object) => void;
  readonly compareAuditReports: (input: object) => AuditComparison;
}>;
export function loadNpmAuditRegression(): Promise<{
  readonly npmAuditRegressionTestHooks: object;
  readonly getR02ImmutableTransition: () => ImmutableTransition;
  readonly createDependencyProjection: (packageJson: object) => object;
}>;
