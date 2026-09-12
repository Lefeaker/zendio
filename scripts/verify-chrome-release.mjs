import { pathToFileURL } from 'node:url';
import { verifyChromeReleaseArtifactManifest } from './utils/releaseArtifactManifest.mjs';

function parseArgs(argv) {
  if (
    argv.length !== 4 ||
    argv[0] !== '--manifest' ||
    argv[2] !== '--transport-mode' ||
    !['local-private-v1', 'github-artifact-v1'].includes(argv[3])
  ) {
    throw new Error('CHROME_RELEASE_VERIFY_ARGUMENTS_INVALID');
  }
  return { manifestPath: argv[1], transportMode: argv[3] };
}

export function verifyChromeRelease(argv = process.argv.slice(2)) {
  return verifyChromeReleaseArtifactManifest(parseArgs(argv));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyChromeRelease()
    .then(() => console.log('Chrome release artifact verified.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
