import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

const SOURCE_PATHS = {
  primitiveButton: 'src/ui/primitives/button/index.ts',
  primitiveInput: 'src/ui/primitives/input/index.ts',
  primitiveSelect: 'src/ui/primitives/select/index.ts',
  foundationA11y: 'src/ui/foundation/a11y/index.ts',
  runtimeSurface: 'src/ui/stitch-runtime/render/renderRuntimeSurface.ts',
  runtimeNodes: 'src/ui/stitch-runtime/render/nodeRenderers.ts',
  harness: 'src/dev/interactionContractHarness.ts'
};

function requirePattern(source, pattern, message, findings) {
  if (!pattern.test(source)) {
    findings.push(message);
  }
}

function collectInteractionContractFindings(sources) {
  const findings = [];
  for (const variant of ['primary', 'secondary', 'ghost', 'outline', 'danger', 'error']) {
    requirePattern(
      sources.primitiveButton,
      new RegExp(`${variant}:`),
      `UI button primitive missing variant ${variant}`,
      findings
    );
  }

  requirePattern(
    sources.primitiveButton,
    /loading\?: boolean;/,
    'UI button primitive missing loading contract',
    findings
  );
  requirePattern(
    sources.foundationA11y,
    /aria-busy/,
    'UI button primitive missing aria-busy handling',
    findings
  );
  requirePattern(
    sources.primitiveInput,
    /validationState\?: InputValidationState;/,
    'UI input primitive missing validationState contract',
    findings
  );
  requirePattern(
    sources.primitiveSelect,
    /validationState\?: InputValidationState;/,
    'UI select primitive missing validationState contract',
    findings
  );
  requirePattern(
    sources.foundationA11y,
    /aria-invalid/,
    'UI form primitives missing aria-invalid handling',
    findings
  );
  requirePattern(
    sources.runtimeSurface,
    /role:\s*'dialog'/,
    'neutral runtime surface missing dialog role',
    findings
  );
  requirePattern(
    sources.runtimeSurface,
    /'aria-modal':\s*isNonModalSurface\s*\?\s*'false'\s*:\s*'true'/,
    'neutral runtime surface missing modal aria contract',
    findings
  );
  requirePattern(
    sources.runtimeNodes,
    /case 'button'/,
    'neutral runtime node renderer missing button contract',
    findings
  );
  requirePattern(
    sources.runtimeNodes,
    /case 'input'/,
    'neutral runtime node renderer missing input contract',
    findings
  );

  for (const [pattern, message] of [
    [/from '..\/ui\/stitch-runtime'/, 'interaction harness not consuming neutral runtime'],
    [
      /from '..\/ui\/stitch-surfaces\/builders\/primitives'/,
      'interaction harness not consuming neutral surface builders'
    ],
    [/renderRuntimeSurface/, 'interaction harness not rendering runtime surfaces'],
    [/createOptionsContractPanel/, 'interaction harness missing Options contract panel'],
    [/createContentContractPanel/, 'interaction harness missing content contract panel'],
    [/Open dialog/, 'interaction harness missing its visible dialog smoke action']
  ]) {
    requirePattern(sources.harness, pattern, message, findings);
  }

  for (const [pattern, message] of [
    [/\.\.\/ui\/hosts\//, 'interaction harness still imports a retired UI host'],
    [
      /\.\.\/ui\/primitives\/(?:layout|checkbox)/,
      'interaction harness still imports retired control/layout code'
    ],
    [/ContentDialogHost|ShadowDialogHost/, 'interaction harness still names a retired dialog host']
  ]) {
    if (pattern.test(sources.harness)) {
      findings.push(message);
    }
  }
  return findings;
}

function readInteractionContractSources(root = ROOT) {
  return Object.fromEntries(
    Object.entries(SOURCE_PATHS).map(([name, relativePath]) => [
      name,
      readFileSync(join(root, relativePath), 'utf8')
    ])
  );
}

function runInteractionContractAudit(root = ROOT) {
  return collectInteractionContractFindings(readInteractionContractSources(root));
}

function main() {
  const findings = runInteractionContractAudit();
  if (findings.length > 0) {
    console.error('Interaction contract audit failed:\n');
    findings.forEach((finding) => console.error(`- ${finding}`));
    process.exitCode = 1;
    return;
  }
  console.log('Interaction contract audit passed.');
}

export {
  collectInteractionContractFindings,
  readInteractionContractSources,
  runInteractionContractAudit
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
