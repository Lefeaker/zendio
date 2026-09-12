import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');
export function writeCanonicalFixture(root: string, relativePath: string, value: unknown): string {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}
export function minimalAuditReport(total = 0) {
  return {
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total },
      dependencies: { prod: 1, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 1 }
    }
  };
}

export function createPortableRuntimeFixture(root: string) {
  const bin = join(root, 'bin');
  const npmRoot = join(root, 'lib', 'node_modules', 'npm');
  const npmBin = join(npmRoot, 'bin');
  mkdirSync(bin, { recursive: true, mode: 0o700 });
  mkdirSync(npmBin, { recursive: true, mode: 0o700 });
  const nodePath = join(bin, 'node');
  const cliPath = join(npmBin, 'npm-cli.js');
  const packagePath = join(npmRoot, 'package.json');
  writeFileSync(nodePath, '#!/fixture/node\n', { mode: 0o700 });
  chmodSync(nodePath, 0o700);
  writeFileSync(cliPath, 'fixture npm cli\n', { mode: 0o600 });
  writeFileSync(packagePath, '{"name":"npm","version":"10.8.2"}\n', { mode: 0o600 });
  symlinkSync('../lib/node_modules/npm/bin/npm-cli.js', join(bin, 'npm'));
  return {
    nodePath,
    cliPath,
    packagePath,
    policy: {
      nodeVersion: 'v20.20.2',
      nodeEngine: '>=20.19 <21',
      npmVersion: 'fixture-npm',
      npmEngine: '>=10 <11',
      npmCliSha256: sha256('fixture npm cli\n'),
      npmPackageSha256: sha256('{"name":"npm","version":"10.8.2"}\n')
    }
  };
}
