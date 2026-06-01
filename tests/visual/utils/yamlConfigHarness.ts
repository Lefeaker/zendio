import type { YamlConfigOverrides } from '@shared/types/yamlConfig';
import { YamlConfigEditorWidgetAdapter } from '../../../src/options/yaml-config-editor/widgetAdapter';

const autoSaveLog: string[] = [];
let adapter: YamlConfigEditorWidgetAdapter | null = null;

const HOST_TEMPLATE = `
  <section id="yamlHarnessRoot">
    <div id="yamlEditorHost"></div>
  </section>
`;

function ensureHost(): HTMLElement {
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
  const host = document.getElementById('yamlEditorHost');
  if (!(host instanceof HTMLElement)) {
    throw new Error('yaml editor harness host missing');
  }
  return host;
}

function mount(initial?: YamlConfigOverrides | null): void {
  adapter?.destroy();
  const host = ensureHost();
  adapter = new YamlConfigEditorWidgetAdapter();
  adapter.mount(
    host,
    { options: { yamlConfig: initial ?? null }, messages: null },
    {
      notifyDirty: (paths) => {
        autoSaveLog.push(paths?.join('.') ?? 'yamlConfig');
      }
    }
  );
}

function collect(): YamlConfigOverrides | null {
  if (!adapter) {
    throw new Error('yaml harness not mounted');
  }
  return adapter.collect().yamlConfig ?? null;
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
