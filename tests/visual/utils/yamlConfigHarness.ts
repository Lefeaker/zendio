import {
  createYamlConfigController,
  type YamlConfigController
} from '../../../src/ui/domains/yaml-config/yamlConfigTable';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';

const autoSaveLog: string[] = [];
let controller: YamlConfigController | null = null;

const HOST_TEMPLATE = `
  <section id="yamlHarnessRoot">
    <div
      id="yamlConfigTable"
      data-label-field="Field"
      data-label-type="Type"
      data-label-article="Article"
      data-label-clipper="Clipper"
      data-label-video="Video"
      data-label-ai="AI"
      data-label-default="Value"
      data-label-actions="Actions"
      data-label-delete="Delete"
      data-label-default-group="Default fields"
      data-label-filter-all="All"
      data-label-custom-group="Custom fields"
      data-error-name-required="Field name is required"
      data-error-name-pattern="Only letters, numbers, underscores, or dashes are allowed, and it cannot start with a number."
      data-error-name-duplicate="Duplicate field name, please pick another."
      data-error-mode-required="Enable at least one content type."
      data-error-type-required="Select a field type."
      data-error-value-invalid="Default value does not match the field type."
      data-warning-unresolved="Fix the highlighted errors before saving."></div>
    <div id="yamlDomainOverrides"></div>
    <button id="yamlAddFieldBtn" type="button">+ Add field</button>
  </section>
`;

function ensureHosts(): { table: HTMLElement; domain: HTMLElement; addButton: HTMLButtonElement } {
  let root = document.getElementById('yamlHarnessRoot');
  if (!root) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = HOST_TEMPLATE;
    const section = wrapper.firstElementChild;
    if (!(section instanceof HTMLElement)) {
      throw new Error('yaml harness template missing root');
    }
    document.body.append(section);
    root = document.getElementById('yamlHarnessRoot');
  }
  const table = document.getElementById('yamlConfigTable');
  const domain = document.getElementById('yamlDomainOverrides');
  const addButton = document.getElementById('yamlAddFieldBtn');
  if (
    !(table instanceof HTMLElement) ||
    !(domain instanceof HTMLElement) ||
    !(addButton instanceof HTMLButtonElement)
  ) {
    throw new Error('yaml harness hosts missing');
  }
  return { table, domain, addButton };
}

function mount(initial?: YamlConfigOverrides | null): void {
  controller?.dispose();
  const hosts = ensureHosts();
  controller = createYamlConfigController({
    tableHost: hosts.table,
    domainHost: hosts.domain,
    addFieldButton: hosts.addButton,
    onDirty: () => {
      autoSaveLog.push('yamlConfig');
    }
  });
  controller.render(initial ?? null);
}

function collect(): YamlConfigOverrides | null {
  if (!controller) {
    throw new Error('yaml harness not mounted');
  }
  return controller.collect();
}

function autoSaveEvents(): string[] {
  return [...autoSaveLog];
}

function resetAutoSave(): void {
  autoSaveLog.length = 0;
}

declare global {
  interface Window {
    yamlTest: {
      mount(initial?: YamlConfigOverrides | null): void;
      collect(): YamlConfigOverrides | null;
      autoSaveEvents(): string[];
      resetAutoSave(): void;
    };
  }
}

window.yamlTest = {
  mount,
  collect,
  autoSaveEvents,
  resetAutoSave
};
