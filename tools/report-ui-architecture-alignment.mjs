import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

const requiredFiles = [
  'src/ui/foundation/tokens/index.ts',
  'src/ui/foundation/icons/index.ts',
  'src/ui/foundation/a11y/index.ts',
  'src/ui/foundation/style-host/index.ts',
  'src/ui/foundation/types/index.ts',
  'src/ui/foundation/keyboard/index.ts',
  'src/ui/foundation/lifecycle/index.ts',
  'src/ui/foundation/lifecycle/BaseComponent.ts',
  'src/ui/primitives/button/index.ts',
  'src/ui/primitives/input/index.ts',
  'src/ui/primitives/select/index.ts',
  'src/ui/primitives/checkbox/index.ts',
  'src/ui/primitives/textarea/index.ts',
  'src/ui/primitives/toggle/index.ts',
  'src/ui/primitives/badge/index.ts',
  'src/ui/primitives/alert/index.ts',
  'src/ui/primitives/dialog/index.ts',
  'src/ui/primitives/layout/index.ts',
  'src/ui/primitives/panel/index.ts',
  'src/ui/patterns/form-field/index.ts',
  'src/ui/patterns/setting-row/index.ts',
  'src/ui/patterns/section-shell/index.ts',
  'src/ui/patterns/message-block/index.ts',
  'src/ui/patterns/confirm-flow/index.ts',
  'src/ui/hosts/options/index.ts',
  'src/ui/hosts/content/index.ts',
  'src/ui/hosts/content/ContentDialogHost.ts',
  'src/ui/hosts/shadow/index.ts',
  'src/ui/hosts/shadow/ShadowDialogHost.ts',
  'src/ui/hosts/shared/contract.ts',
  'src/ui/domains/vault-router/index.ts',
  'src/ui/domains/yaml-config/index.ts',
  'src/ui/domains/privacy/index.ts',
  'src/ui/domains/reading/index.ts',
  'src/ui/domains/video/index.ts',
  'docs/archive/legacy-options-assets/obsidian-clipper-style.css',
  'docs/archive/legacy-options-assets/obsidian-hybrid-preview.html',
  'docs/archive/legacy-options-assets/optionuicsssuggest.md'
];

const forbiddenFiles = [
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
  'src/content/video/components/VideoDialog.ts',
  'src/content/ui/supportPrompt/SupportPromptView.ts'
];

const requiredSnippets = {
  'src/options/components/layout/MainContent.ts': ['../../../ui/hosts/options'],
  'src/options/components/sections/BaseSection.ts': ['../../../ui/patterns/section-shell'],
  'src/options/components/sections/RoutingSection.ts': ['../../../ui/domains/vault-router'],
  'src/options/components/sections/YamlConfigSection.ts': ['../../../ui/domains/yaml-config'],
  'src/options/components/sections/PrivacySection.ts': ['../../../ui/domains/privacy'],
  'src/content/reader/ui/ReaderDialogPanel.ts': ['../../../ui/domains/reading'],
  'src/content/video/ui/VideoDialogPanel.ts': ['../../../ui/domains/video'],
  'src/content/ui/supportPrompt.ts': ['../../ui/domains/video'],
  'src/options/app/bootstrap.ts': ['../../ui/domains/theme'],
  'src/content/shared/panels/styleSheetManager.ts': ['../../../ui/foundation/style-host'],
  'src/content/clipper/shared/styleSheetManager.ts': ['../../../ui/foundation/style-host']
};

const findings = [];

for (const relativePath of requiredFiles) {
  if (!existsSync(join(ROOT, relativePath))) {
    findings.push(`missing required file: ${relativePath}`);
  }
}

for (const relativePath of forbiddenFiles) {
  if (existsSync(join(ROOT, relativePath))) {
    findings.push(`legacy wrapper/alias still present: ${relativePath}`);
  }
}

const envSource = readFileSync(join(ROOT, 'src/env.d.ts'), 'utf8');
for (const token of ['__aiobReaderActive', '__aiobReaderController']) {
  if (envSource.includes(token)) {
    findings.push(`legacy global declaration still present in src/env.d.ts: ${token}`);
  }
}

for (const [relativePath, snippets] of Object.entries(requiredSnippets)) {
  const source = readFileSync(join(ROOT, relativePath), 'utf8');
  for (const snippet of snippets) {
    if (!source.includes(snippet)) {
      findings.push(`${relativePath} missing snippet: ${snippet}`);
    }
  }
}

const forbiddenPatterns = [
  {
    file: 'src/content/reader/session.ts',
    pattern: /initializeDefaultReaderSessionDependencies|getDefaultReaderSessionDependencies|defaultReaderSessionDependencies/,
    message: 'reader session still exposes default dependency injection'
  },
  {
    file: 'src/content/video/session.ts',
    pattern: /initializeDefaultVideoSessionDependencies|getDefaultVideoSessionDependencies|defaultVideoSessionDependencies/,
    message: 'video session still exposes default dependency injection'
  },
  {
    file: 'src/content/video/prompt.ts',
    pattern: /initializeDefaultVideoPromptDependencies|defaultVideoPromptDependencies/,
    message: 'video prompt still exposes default dependency injection'
  }
];

for (const { file, pattern, message } of forbiddenPatterns) {
  const source = readFileSync(join(ROOT, file), 'utf8');
  if (pattern.test(source)) {
    findings.push(message);
  }
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) {
      continue;
    }
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(fullPath)) {
      continue;
    }

    const source = readFileSync(fullPath, 'utf8');
    const relativePath = relative(ROOT, fullPath);

    if (relativePath !== 'src/ui/foundation/icons/index.ts' && /from 'lucide'/.test(source)) {
      findings.push(`lucide import outside foundation/icons: ${relativePath}`);
    }

    if (
      relativePath.startsWith('src/ui/domains/') &&
      /from ['"][^'"]*(?:@options|@content|\.\.\/\.\.\/\.\.\/(?:options|content)\/)/.test(source)
    ) {
      findings.push(`domain implementation still depends on feature layer: ${relativePath}`);
    }

    if (/from ['"][^'"]*(?:options\/components\/shared\/(?:Daisy(?:Alert|Badge|Button|Checkbox|Dialog|Input|Select|Textarea|Toggle)|OptionsLayout)|options\/components\/controls\/(?:YamlConfigView|VaultRouterView|privacySettings|yamlConfigTable(?:Model|Validation|Types|Dom|ControllerState(?:\.impl)?|ControllerTypes)?|yamlConfigTable)|content\/shared\/daisy|content\/reader\/components\/ReaderDialog|content\/video\/components\/VideoDialog|content\/ui\/supportPrompt\/SupportPromptView)/.test(source)) {
      findings.push(`production file still imports retired wrapper/alias: ${relativePath}`);
    }
  }
}

walk(join(ROOT, 'src'));
walk(join(ROOT, 'tests'));

if (findings.length > 0) {
  console.error('UI architecture alignment check failed:\n');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('UI architecture alignment passed.');
