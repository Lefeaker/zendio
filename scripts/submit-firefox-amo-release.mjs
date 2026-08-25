import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyFirefoxReleaseArtifactManifest } from './utils/firefoxReleaseArtifactManifest.mjs';
import { submitFirefoxAmoReleaseCore } from './utils/firefoxAmoSubmissionCore.mjs';

function fail(code) {
  throw new Error(code);
}

function parseArgs(argv) {
  if (
    argv.length !== 10 ||
    argv[0] !== '--artifact-manifest' ||
    argv[2] !== '--transport-mode' ||
    argv[3] !== 'github-artifact-v1' ||
    argv[4] !== '--submission-state-file' ||
    argv[6] !== '--saved-upload-uuid-path' ||
    argv[8] !== '--channel' ||
    !['listed', 'unlisted'].includes(argv[9])
  ) {
    fail('FIREFOX_AMO_ARGUMENTS_INVALID');
  }
  return {
    manifestPath: resolve(argv[1]),
    stateFile: resolve(argv[5]),
    savedUploadUuidPath: resolve(argv[7]),
    channel: argv[9]
  };
}

export async function submitFirefoxAmoRelease(
  argv = process.argv.slice(2),
  environment = process.env
) {
  const args = parseArgs(argv);
  const attemptRoot = dirname(dirname(dirname(args.stateFile)));
  const binding = await verifyFirefoxReleaseArtifactManifest({
    manifestPath: args.manifestPath,
    transportMode: 'github-artifact-v1',
    expectedAttemptRoot: attemptRoot
  });
  const stateRoot = dirname(args.stateFile);
  const downloadDir = join(stateRoot, 'downloads');
  if (
    args.stateFile !== join(attemptRoot, 'store-state/firefox/submission-state.json') ||
    args.savedUploadUuidPath !== join(stateRoot, 'web-ext-upload/upload-uuid.json')
  ) {
    fail('FIREFOX_AMO_STATE_TOPOLOGY');
  }
  return submitFirefoxAmoReleaseCore({
    binding,
    manifestPath: args.manifestPath,
    stateFile: args.stateFile,
    savedUploadUuidPath: args.savedUploadUuidPath,
    downloadDir,
    channel: args.channel,
    credentials: {
      apiKey: environment.WEB_EXT_API_KEY,
      apiSecret: environment.WEB_EXT_API_SECRET
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  submitFirefoxAmoRelease().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
