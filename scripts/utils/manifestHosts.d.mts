export function resolveRestHostPermissions(): string[];

export function applyRestHostPermissions<T extends { host_permissions?: string[] }>(
  manifest: T
): T & { host_permissions?: string[] };
