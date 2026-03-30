import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function requirePattern(source, pattern, message, findings) {
  if (!pattern.test(source)) {
    findings.push(message);
  }
}

const findings = [];

const primitiveButtonSource = read('src/ui/primitives/button/index.ts');
const primitiveInputSource = read('src/ui/primitives/input/index.ts');
const primitiveSelectSource = read('src/ui/primitives/select/index.ts');
const foundationA11ySource = read('src/ui/foundation/a11y/index.ts');
const primitiveDialogSource = read('src/ui/primitives/dialog/index.ts');
const contentDialogSource = read('src/ui/hosts/content/ContentDialogHost.ts');
const optionsDialogSource = read('src/ui/hosts/shadow/ShadowDialogHost.ts');
const harnessSource = read('src/dev/interactionContractHarness.ts');

for (const variant of ['primary', 'secondary', 'ghost', 'outline', 'danger', 'error']) {
  requirePattern(
    primitiveButtonSource,
    new RegExp(`${variant}:`),
    `UI button primitive missing variant ${variant}`,
    findings
  );
}

requirePattern(
  primitiveButtonSource,
  /loading\?: boolean;/,
  'UI button primitive missing loading contract',
  findings
);
requirePattern(
  foundationA11ySource,
  /aria-busy/,
  'UI button primitive missing aria-busy handling',
  findings
);
requirePattern(
  primitiveInputSource,
  /validationState\?: InputValidationState;/,
  'UI input primitive missing validationState contract',
  findings
);
requirePattern(
  foundationA11ySource,
  /aria-invalid/,
  'UI input primitive missing aria-invalid handling',
  findings
);
requirePattern(
  primitiveSelectSource,
  /validationState\?: InputValidationState;/,
  'UI select primitive missing validationState contract',
  findings
);
requirePattern(
  foundationA11ySource,
  /aria-invalid/,
  'UI select primitive missing aria-invalid handling',
  findings
);

for (const [source, pattern, message] of [
  [primitiveDialogSource, /dataset\.element = 'header'/, 'UI dialog frame missing header marker'],
  [primitiveDialogSource, /dataset\.element = 'body'/, 'UI dialog frame missing body marker'],
  [primitiveDialogSource, /dataset\.element = 'footer'/, 'UI dialog frame missing footer marker'],
  [primitiveDialogSource, /setAttribute\('role', 'dialog'\)/, 'UI dialog frame missing role'],
  [primitiveDialogSource, /setAttribute\('aria-modal', 'true'\)/, 'UI dialog frame missing aria-modal'],
  [contentDialogSource, /createDialogFrame/, 'ContentDaisyDialog not consuming UI dialog primitive'],
  [optionsDialogSource, /createDialogFrame/, 'DaisyDialog not consuming UI dialog primitive'],
  [harnessSource, /\.\.\/ui\/primitives\//, 'interaction harness not consuming ui primitives']
]) {
  requirePattern(source, pattern, message, findings);
}

if (findings.length > 0) {
  console.error('Interaction contract audit failed:\n');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('Interaction contract audit passed.');
