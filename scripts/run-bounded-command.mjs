import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseManagedCommandInvocationArgv } from './config/commandBoundaryProfiles.mjs';
import { runBoundedCommand, runCanonicalCommandRequest } from './utils/boundedCommand.mjs';

export async function main(argv = process.argv.slice(2), environment = process.env) {
  const invocation =
    argv.length === 0
      ? null
      : parseManagedCommandInvocationArgv(['node', 'scripts/run-bounded-command.mjs', ...argv]);
  const result = invocation
    ? await runBoundedCommand(
        { profileId: invocation.profileId, arguments: invocation.arguments },
        { environment, mirrorOutput: true }
      )
    : await runCanonicalCommandRequest(environment, { mirrorOutput: true });
  if (!result.ok) {
    process.stderr.write(
      `[command-boundary] ${result.profileId} failed: ${result.terminalReason}${
        result.signal ? ` signal=${result.signal}` : ` exit=${String(result.exitCode ?? 1)}`
      }\n`
    );
  }
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await main();
    if (!result.ok) {
      if (result.signal && process.platform !== 'win32') process.kill(process.pid, result.signal);
      process.exitCode = result.exitCode && result.exitCode > 0 ? result.exitCode : 1;
    }
  } catch (error) {
    process.stderr.write(
      `[command-boundary] ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}
