import { el } from './dom';
import { buildYamlEditorPreview } from './preview';
import type { YamlConfigEditorViewOptions } from './fieldRowsView';

export function updateYamlPreview(host: HTMLElement, options: YamlConfigEditorViewOptions): void {
  const target = host.querySelector<HTMLElement>('[data-yaml-preview="content"] pre');
  if (!target) {
    return;
  }
  target.replaceChildren(
    target.ownerDocument.createTextNode(
      buildYamlEditorPreview(options.state, options.filter, options.labels.contentTypes)
    )
  );
}

export function renderPreview(options: YamlConfigEditorViewOptions): HTMLElement {
  const details = el('details', { className: 'u-mt-block yaml-preview-details' });
  const output = el('div', {
    className: 'yaml-preview',
    dataset: { yamlPreview: 'content' }
  });
  output.append(
    el('pre', {
      text: buildYamlEditorPreview(options.state, options.filter, options.labels.contentTypes)
    })
  );
  details.append(el('summary', { text: options.labels.table.previewSummary }), output);
  return details;
}
