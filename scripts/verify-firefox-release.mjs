import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { verifyFirefoxReleaseArtifactManifest } from './utils/firefoxReleaseArtifactManifest.mjs';

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!['--manifest', '--transport-mode'].includes(key) || !value || values.has(key)) {
      throw new Error('FIREFOX_RELEASE_ARGUMENT_CONTRACT');
    }
    values.set(key, value);
  }
  if (values.size !== 2) throw new Error('FIREFOX_RELEASE_ARGUMENT_CONTRACT');
  return values;
}

export async function verifyFirefoxRelease(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  return verifyFirefoxReleaseArtifactManifest({
    manifestPath: args.get('--manifest'),
    transportMode: args.get('--transport-mode')
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyFirefoxRelease()
    .then(() => console.log('Firefox release artifact verified.'))
    .catch((error) => {
      console.error(error?.message ?? error);
      process.exitCode = 1;
    });
}
