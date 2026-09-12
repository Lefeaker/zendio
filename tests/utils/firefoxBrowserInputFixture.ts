import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Native-header fixture only: this never launches and does not attest browser provenance.
export function createSharedFirefoxFixture(root: string) {
  const home = join(root, 'account-home');
  const browsersPath = join(home, 'Library', 'Caches', 'ms-playwright');
  const revisionRoot = join(browsersPath, 'firefox-1522');
  const firefoxExecutable = join(revisionRoot, 'firefox/Nightly.app/Contents/MacOS/firefox');
  mkdirSync(join(revisionRoot, 'firefox/Nightly.app/Contents/MacOS'), {
    recursive: true,
    mode: 0o755
  });
  const executableBytes = Buffer.alloc(64);
  Buffer.from('cffaedfe', 'hex').copy(executableBytes);
  writeFileSync(firefoxExecutable, executableBytes, { mode: 0o755 });
  const markerPath = join(revisionRoot, 'INSTALLATION_COMPLETE');
  writeFileSync(markerPath, '', { mode: 0o644 });
  return {
    home,
    browsersPath,
    revisionRoot,
    firefoxExecutable,
    markerPath,
    operations: { userInfoOperation: () => ({ homedir: home }), platform: 'darwin' }
  };
}
