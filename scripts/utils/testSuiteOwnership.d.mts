export interface TestShardDescriptor {
  id: string;
  patterns: string[];
}

export interface BrowserShardDescriptor {
  id: string;
  args: string[];
}

export interface VitestCollectionConfig {
  include: string[];
  exclude: string[];
}

export interface PlaywrightCollectionConfig {
  testDir: string;
  testMatch: string[];
  testIgnore: string[];
}

export interface OwnershipReport {
  ok: boolean;
  inventory: string[];
  classifications: Array<{
    file: string;
    kind: 'runnable' | 'registrar' | 'support' | 'unclassified';
    importedBy?: string[];
  }>;
  runnableFiles: string[];
  owners: Array<{ file: string; owners: string[] }>;
  zeroOwner: string[];
  multipleOwners: Array<{ file: string; owners: string[] }>;
  emptyPatterns: Array<{ kind: string; shard: string; pattern: string }>;
  missingRouteMembers: Array<{ route: string; file: string }>;
  duplicateRouteMembers: Array<{ route: string; file: string }>;
  invalidDescriptors: string[];
  unclassifiedModules: string[];
  failures: string[];
  counts: {
    inventory: number;
    runnable: number;
    classified: number;
    owned: number;
    zeroOwner: number;
    multipleOwner: number;
  };
}

export function decodeNulDelimitedPaths(value: Uint8Array, label?: string): string[];

export function listGitVisibleTestFiles(options?: {
  cwd?: string;
  runGit?: (args: string[], options: { cwd: string }) => Uint8Array;
  lstat?: (path: string) => {
    isSymbolicLink(): boolean;
    isFile(): boolean;
  };
}): string[];

export function analyzeTestModule(
  file: string,
  source: string,
  options?: { allowGlobalTestApi?: boolean }
): {
  file: string;
  source: string;
  directRegistration: boolean;
  potentialRegistration: boolean;
  dynamicImportSpecifiers: string[];
  imports: Array<{
    specifier: string;
    bindings: Array<{ imported: string; local: string }>;
    dynamic: boolean;
  }>;
  importedBindings: Map<string, { specifier: string; imported: string; dynamic?: boolean }>;
  calledIdentifiers: Set<string>;
  calledProperties: Set<string>;
  dynamicRegistrarCalls: Array<{ specifier: string; imported: string }>;
  exportedRegistrars: Set<string>;
};

export function parseVitestConfig(source: string, file?: string): VitestCollectionConfig;
export function parsePlaywrightConfig(source: string, file?: string): PlaywrightCollectionConfig;
export function matchesTestPattern(file: string, pattern: string): boolean;

export function buildTestSuiteOwnershipReport(options: {
  files: string[];
  sources: Map<string, string>;
  unitShards: TestShardDescriptor[];
  e2eShards: TestShardDescriptor[];
  browserSuites: Record<string, BrowserShardDescriptor[]>;
  packageScripts: Record<string, string>;
  vitestConfigs: {
    unit: VitestCollectionConfig;
    e2e: VitestCollectionConfig;
  };
  playwrightConfigs: Map<string, PlaywrightCollectionConfig>;
}): OwnershipReport;

export function auditRepositoryTestSuiteOwnership(options?: {
  cwd?: string;
  runGit?: (args: string[], options: { cwd: string }) => Uint8Array;
  lstat?: (path: string) => {
    isSymbolicLink(): boolean;
    isFile(): boolean;
  };
  readFile?: (path: string) => Uint8Array;
}): OwnershipReport;

export function formatTestSuiteOwnershipReport(report: OwnershipReport): string;
