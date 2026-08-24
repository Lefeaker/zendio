import { describe, expect, it } from 'vitest';
import { runBoundedCommand } from '../../../scripts/utils/boundedCommand.mjs';

async function printStylelintConfig(filePath: string) {
  const result = await runBoundedCommand({
    profileId: 'stylelint-v1',
    arguments: ['--print-config', filePath]
  });
  if (!result.ok) {
    throw new Error(
      `Stylelint boundary failed: ${result.terminalReason}\n${result.output.stderr.text}`
    );
  }
  return JSON.parse(result.output.stdout.text);
}

describe('Options Stylelint config', () => {
  it('applies non-empty rules through the locked Stylelint boundary', async () => {
    const config = await printStylelintConfig('src/options/stitch/styles/runtime/responsive.css');

    expect(Object.keys(config.rules ?? {})).toContain('selector-class-pattern');
  });
});
