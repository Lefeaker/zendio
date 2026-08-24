import type { BoundedCommandResult } from './utils/boundedCommand.mjs';

export function main(
  argv?: readonly string[],
  environment?: NodeJS.ProcessEnv
): Promise<BoundedCommandResult>;
