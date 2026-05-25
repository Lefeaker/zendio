export function isNodeVersionSupported(currentVersion: string, nodeRange: string): boolean;
export function assertNodeVersionSatisfiesRange(currentVersion: string, nodeRange: string): void;
export function readPackageNodeEngine(root?: string): string;
export function runRuntimeVerification(options?: { currentVersion?: string; root?: string }): void;
