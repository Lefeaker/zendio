import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runProductionBuildGraph, validateOwnership } from './report-ui-production-ownership.mjs';

const ROOT = process.cwd();
const MANIFEST_PATH = 'tools/ui-production-ownership.json';

const STABLE_REQUIRED_FILES = [
  'src/content/reader/ui/ReaderDialogPanel.ts',
  'src/content/video/ui/videoDialogSurface.ts',
  'src/content/ui/supportPrompt.ts',
  'src/options/app/bootstrap.ts',
  'src/content/shared/panels/styleSheetManager.ts',
  'src/content/clipper/shared/styleSheetManager.ts',
  'docs/archive/legacy-options-assets/obsidian-clipper-style.css',
  'docs/reference-fixtures/legacy-options/obsidian-hybrid-preview.html'
];

const FORBIDDEN_FILES = [
  'src/options/styles/design-tokens.css',
  'src/options/components/shared/listBuilder.ts',
  'src/options/components/shared/ThemeSwitcher.ts',
  'src/options/components/shared/FormComponents.ts',
  'src/options/components/shared/DaisyTable.ts',
  'src/options/components/shared/DaisyRadioGroup.ts',
  'src/options/components/shared/DaisyCard.ts',
  'src/options/components/shared/BaseComponent.ts',
  'src/options/obsidian-clipper-style.css',
  'src/options/obsidian-hybrid-preview.html',
  'src/options/optionuicsssuggest.md',
  'src/options/components/shared/DaisyAlert.ts',
  'src/options/components/shared/DaisyBadge.ts',
  'src/options/components/shared/DaisyButton.ts',
  'src/options/components/shared/DaisyCheckbox.ts',
  'src/options/components/shared/DaisyDialog.ts',
  'src/options/components/shared/DaisyInput.ts',
  'src/options/components/shared/DaisySelect.ts',
  'src/options/components/shared/DaisyTextarea.ts',
  'src/options/components/shared/DaisyToggle.ts',
  'src/options/components/shared/OptionsLayout.ts',
  'src/options/components/controls/VaultRouterView.ts',
  'src/options/components/controls/YamlConfigView.ts',
  'src/options/components/controls/privacySettings.ts',
  'src/options/components/controls/yamlConfigTable.ts',
  'src/options/components/controls/yamlConfigTableModel.ts',
  'src/options/components/controls/yamlConfigTableValidation.ts',
  'src/options/components/controls/yamlConfigTableTypes.ts',
  'src/options/components/controls/yamlConfigTableDom.ts',
  'src/options/components/controls/yamlConfigTableControllerState.ts',
  'src/options/components/controls/yamlConfigTableControllerState.impl.ts',
  'src/options/components/controls/yamlConfigTableControllerTypes.ts',
  'src/content/shared/daisy/ContentDaisyBadge.ts',
  'src/content/shared/daisy/ContentDaisyButton.ts',
  'src/content/shared/daisy/ContentDaisyDialog.ts',
  'src/content/shared/daisy/ContentDialogFooter.ts',
  'src/content/shared/daisy/ContentLayout.ts',
  'src/content/shared/daisy/index.ts',
  'src/content/reader/components/ReaderDialog.ts',
  'src/content/video/components/VideoDialog.ts'
];

const REQUIRED_SNIPPETS = {
  'src/content/reader/ui/ReaderDialogPanel.ts': [
    ['@content/stitch/runtimeSurfaceRenderer'],
    ['@content/stitch/runtimeSurfaceContent']
  ],
  'src/content/video/ui/videoDialogSurface.ts': [
    ['@content/stitch/runtimeSurfaceRenderer'],
    ['@content/stitch/runtimeSurfaceContent']
  ],
  'src/content/ui/supportPrompt.ts': [
    ['@content/stitch/runtimeSurfaceRenderer'],
    ['@content/stitch/runtimeSurfaceContent']
  ],
  'src/options/app/bootstrap.ts': [['./productionStitchShell']],
  'src/content/shared/panels/styleSheetManager.ts': [
    ['../../../ui/foundation/style-host', '@ui/foundation/style-host']
  ],
  'src/content/clipper/shared/styleSheetManager.ts': [
    ['../../../ui/foundation/style-host', '@ui/foundation/style-host']
  ]
};

const FORBIDDEN_SOURCE_PATTERNS = [
  {
    file: 'src/content/reader/session.ts',
    pattern:
      /initializeDefaultReaderSessionDependencies|getDefaultReaderSessionDependencies|defaultReaderSessionDependencies/,
    message: 'reader session still exposes default dependency injection'
  },
  {
    file: 'src/content/video/session.ts',
    pattern:
      /initializeDefaultVideoSessionDependencies|getDefaultVideoSessionDependencies|defaultVideoSessionDependencies/,
    message: 'video session still exposes default dependency injection'
  },
  {
    file: 'src/content/video/prompt.ts',
    pattern: /initializeDefaultVideoPromptDependencies|defaultVideoPromptDependencies/,
    message: 'video prompt still exposes default dependency injection'
  }
];

function normalizePath(value) {
  return value.split('\\').join('/');
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

function isExactUiPath(value) {
  return (
    typeof value === 'string' &&
    /^src\/ui\/.+\.ts$/.test(value) &&
    !/[*?\[\]{}]/.test(value) &&
    !value.includes('..')
  );
}

function collectManifestTreeFindings(root, manifest) {
  const findings = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['ownership manifest is not an object'];
  }
  if (manifest.closureState !== 'intermediate' && manifest.closureState !== 'final') {
    findings.push('ownership manifest has an invalid closureState');
  }
  if (!Array.isArray(manifest.rows) || manifest.rows.length === 0) {
    findings.push('ownership manifest has no rows');
    return findings;
  }

  const seen = new Set();
  for (const row of manifest.rows) {
    if (!isExactUiPath(row?.path)) {
      findings.push(`ownership manifest row is not an exact UI path: ${String(row?.path)}`);
      continue;
    }
    if (seen.has(row.path)) {
      findings.push(`ownership manifest contains a duplicate UI path: ${row.path}`);
      continue;
    }
    seen.add(row.path);
    if (!existsSync(join(root, row.path))) {
      findings.push(`ownership manifest path is missing from the current tree: ${row.path}`);
    }
  }

  if (
    manifest.closureState === 'final' &&
    manifest.rows.some(
      (row) => row.disposition !== 'production-runtime' && row.disposition !== 'production-compile'
    )
  ) {
    findings.push('final ownership manifest still contains a non-production disposition');
  }

  return findings;
}

function walkSourceFiles(root, relativeRoot, findings) {
  const directory = join(root, relativeRoot);
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of readdirSync(directory)) {
    if (entry.startsWith('.')) {
      continue;
    }
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walkSourceFiles(root, normalizePath(relative(root, fullPath)), findings);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(fullPath)) {
      continue;
    }

    const source = readFileSync(fullPath, 'utf8');
    const relativePath = normalizePath(relative(root, fullPath));
    if (
      relativePath !== 'src/ui/foundation/icons/index.ts' &&
      /from\s+['"]lucide['"]/.test(source)
    ) {
      findings.push(`lucide import outside foundation/icons: ${relativePath}`);
    }
    if (
      relativePath.startsWith('src/ui/domains/') &&
      /from ['"][^'"]*(?:@options|@content|\.\.\/\.\.\/\.\.\/(?:options|content)\/)/.test(source)
    ) {
      findings.push(`domain implementation still depends on feature layer: ${relativePath}`);
    }
    if (
      /from ['"][^'"]*(?:options\/components\/shared\/(?:Daisy(?:Alert|Badge|Button|Checkbox|Dialog|Input|Select|Textarea|Toggle)|OptionsLayout)|options\/components\/controls\/(?:YamlConfigView|VaultRouterView|privacySettings|yamlConfigTable(?:Model|Validation|Types|Dom|ControllerState(?:\.impl)?|ControllerTypes)?|yamlConfigTable)|content\/shared\/daisy|content\/reader\/components\/ReaderDialog|content\/video\/components\/VideoDialog|content\/ui\/supportPrompt\/SupportPromptView|ui\/domains\/video\/SupportPromptView)/.test(
        source
      )
    ) {
      findings.push(`production file still imports retired wrapper/alias: ${relativePath}`);
    }
  }
}

function collectUiArchitectureFindings({ root = ROOT, manifest } = {}) {
  const currentManifest = manifest ?? readJson(root, MANIFEST_PATH);
  const findings = collectManifestTreeFindings(root, currentManifest);

  for (const relativePath of STABLE_REQUIRED_FILES) {
    if (!existsSync(join(root, relativePath))) {
      findings.push(`missing required file: ${relativePath}`);
    }
  }
  for (const relativePath of FORBIDDEN_FILES) {
    if (existsSync(join(root, relativePath))) {
      findings.push(`legacy wrapper/alias still present: ${relativePath}`);
    }
  }

  const envPath = join(root, 'src/env.d.ts');
  if (existsSync(envPath)) {
    const envSource = readFileSync(envPath, 'utf8');
    for (const token of ['__aiobReaderActive', '__aiobReaderController']) {
      if (envSource.includes(token)) {
        findings.push(`legacy global declaration still present in src/env.d.ts: ${token}`);
      }
    }
  } else {
    findings.push('missing required file: src/env.d.ts');
  }

  for (const [relativePath, snippetGroups] of Object.entries(REQUIRED_SNIPPETS)) {
    const fullPath = join(root, relativePath);
    if (!existsSync(fullPath)) {
      continue;
    }
    const source = readFileSync(fullPath, 'utf8');
    for (const snippets of snippetGroups) {
      if (!snippets.some((snippet) => source.includes(snippet))) {
        findings.push(`${relativePath} missing snippet: ${snippets.join(' OR ')}`);
      }
    }
  }

  for (const { file, pattern, message } of FORBIDDEN_SOURCE_PATTERNS) {
    const fullPath = join(root, file);
    if (existsSync(fullPath) && pattern.test(readFileSync(fullPath, 'utf8'))) {
      findings.push(message);
    }
  }

  walkSourceFiles(root, 'src', findings);
  walkSourceFiles(root, 'tests', findings);
  return findings;
}

function runUiArchitectureAlignment(root = ROOT) {
  const manifest = readJson(root, MANIFEST_PATH);
  const findings = [];
  try {
    const graph = runProductionBuildGraph(root);
    validateOwnership({ root, manifest, graph });
  } catch (error) {
    findings.push(`ownership manifest validation failed: ${error.message}`);
  }
  findings.push(...collectUiArchitectureFindings({ root, manifest }));
  return findings;
}

function main() {
  const root = resolve(ROOT);
  const findings = runUiArchitectureAlignment(root);
  if (findings.length > 0) {
    console.error('UI architecture alignment check failed:\n');
    findings.forEach((finding) => console.error(`- ${finding}`));
    process.exitCode = 1;
    return;
  }
  console.log('UI architecture alignment passed.');
}

export { collectManifestTreeFindings, collectUiArchitectureFindings, runUiArchitectureAlignment };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
