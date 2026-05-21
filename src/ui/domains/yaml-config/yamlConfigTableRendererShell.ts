import type { YamlContentType } from '@shared/types/yamlConfig';
import { createOptionsButtonElement } from '../../primitives/button';
import {
  createLayoutElement,
  createOptionsActionRow,
  createOptionsPanel
} from '../../primitives/layout';
import type { YamlConfigTableLabels } from './yamlConfigTableTypes';
import { bindYamlClick } from './yamlConfigTableRendererEvents';

export function createYamlConfigTableShell(): HTMLElement {
  return createOptionsPanel({
    className:
      'aobx-table min-w-[800px] w-full overflow-hidden rounded-lg border border-base-300 bg-base-100 text-sm shadow-sm'
  });
}

export function renderFilters(args: {
  labels: YamlConfigTableLabels;
  currentFilterMode: YamlContentType | null;
  onToggleFilter: (mode: YamlContentType | null) => void;
}): HTMLElement {
  const { labels, currentFilterMode, onToggleFilter } = args;
  const container = createOptionsActionRow({ className: 'mb-4 flex flex-wrap gap-2 pt-0' });
  const filters: Array<{ mode: YamlContentType | null; label: string }> = [
    { mode: null, label: labels.filterAll },
    { mode: 'article', label: labels.article },
    { mode: 'clipper', label: labels.clipper },
    { mode: 'video', label: labels.video },
    { mode: 'ai_chat', label: labels.ai }
  ];

  filters.forEach(({ mode, label }) => {
    const button = createOptionsButtonElement({
      label,
      size: 'xs',
      className:
        'rounded-full bg-base-200 text-base-content/60 border border-base-300 hover:bg-base-300 hover:text-base-content hover:border-base-content'
    });
    if (currentFilterMode === mode) {
      button.classList.add('bg-accent/10', 'text-accent', 'border-accent/20');
      button.classList.remove('bg-base-200', 'text-base-content/60', 'border-base-300');
    }
    bindYamlClick(button, () => onToggleFilter(mode));
    container.append(button);
  });

  return container;
}

export function buildHeader(args: {
  labels: YamlConfigTableLabels;
  currentSortMode: YamlContentType | null;
  onToggleSort: (mode: YamlContentType) => void;
}): HTMLElement {
  const { labels, currentSortMode, onToggleSort } = args;
  const header = createLayoutElement({
    className:
      'grid grid-cols-[minmax(120px,1.5fr)_100px_repeat(4,60px)_minmax(120px,1fr)_80px] gap-2 border-b border-base-300 bg-base-200 p-3 text-xs font-medium uppercase tracking-wider text-base-content/60'
  });

  const columns: Array<{ key: string; label: string; mode?: YamlContentType }> = [
    { key: 'field', label: labels.field },
    { key: 'type', label: labels.type },
    { key: 'article', label: labels.article, mode: 'article' },
    { key: 'clipper', label: labels.clipper, mode: 'clipper' },
    { key: 'video', label: labels.video, mode: 'video' },
    { key: 'ai', label: labels.ai, mode: 'ai_chat' },
    { key: 'defaultValue', label: labels.defaultValue },
    { key: 'actions', label: labels.actions }
  ];

  columns.forEach((column) => {
    const span = document.createElement('span');
    const mode = column.mode;
    if (mode) {
      const button = createOptionsButtonElement({
        label: column.label,
        variant: 'ghost',
        size: 'sm',
        className: 'gap-1 hover:text-text'
      });
      if (currentSortMode === mode) {
        button.classList.add('text-accent', 'font-bold');
      }
      bindYamlClick(button, () => onToggleSort(mode));
      span.append(button);
    } else {
      span.textContent = column.label;
    }
    header.append(span);
  });

  return header;
}

export function buildGlobalWarnings(globalErrors: string[]): HTMLElement | null {
  if (!globalErrors.length) {
    return null;
  }
  const container = createOptionsPanel({
    className: 'alert alert-error aobx-table__global-errors p-3 text-sm',
    attributes: { role: 'alert' }
  });
  globalErrors.forEach((message) => {
    container.append(createLayoutElement({ textContent: message }));
  });
  return container;
}
