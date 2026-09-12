import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runBoundedCommand } from '../../../scripts/utils/boundedCommand.mjs';

const StylelintConfigSchema = z.object({
  rules: z.record(z.unknown()).optional()
});

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
  return StylelintConfigSchema.parse(JSON.parse(result.output.stdout.text));
}

describe('Options Stylelint config', () => {
  it.each([
    ['retained Options CSS', 'src/options/stitch/styles/runtime/responsive.css'],
    ['neutral UI CSS', 'src/ui/stitch-runtime/styles/runtime/base.css']
  ])('applies non-empty rules to %s through the locked Stylelint boundary', async (_name, path) => {
    const config = await printStylelintConfig(path);

    expect(Object.keys(config.rules ?? {})).toContain('selector-class-pattern');
  });
});
