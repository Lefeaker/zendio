import type { YamlEditorRenderRequest, YamlEditorScrollTarget } from './view';

interface TableScrollPosition {
  scrollTop: number;
  scrollLeft: number;
}

export interface YamlEditorScrollSnapshot {
  fieldTable?: TableScrollPosition;
  domainTables: Record<string, TableScrollPosition>;
}

function readScrollPosition(element: HTMLElement): TableScrollPosition {
  return {
    scrollTop: element.scrollTop,
    scrollLeft: element.scrollLeft
  };
}

function applyScrollPosition(element: HTMLElement | null, position: TableScrollPosition): void {
  if (!element) {
    return;
  }
  element.scrollTop = position.scrollTop;
  element.scrollLeft = position.scrollLeft;
}

function findFieldRow(container: HTMLElement, fieldId: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>('[data-field-ids]')).find((row) =>
      (row.dataset.fieldIds ?? '').split(' ').includes(fieldId)
    ) ?? null
  );
}

function findDomainRule(container: HTMLElement, entryId: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>('[data-domain-rule-id]')).find(
      (candidate) => candidate.dataset.domainRuleId === entryId
    ) ?? null
  );
}

function findDomainFieldRow(
  container: HTMLElement,
  domainEntryId: string,
  fieldId: string
): HTMLElement | null {
  return (
    findDomainRule(container, domainEntryId)?.querySelector<HTMLElement>(
      `[data-domain-field-id="${fieldId}"]`
    ) ?? null
  );
}

function findScrollTarget(
  container: HTMLElement,
  target: YamlEditorScrollTarget
): HTMLElement | null {
  if (target.kind === 'field') {
    return findFieldRow(container, target.fieldId);
  }
  return findDomainFieldRow(container, target.domainEntryId, target.fieldId);
}

function scrollRowIntoTable(row: HTMLElement): void {
  const shell = row.closest<HTMLElement>('.yaml-table-scroll');
  if (shell && shell.clientHeight > 0) {
    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const visibleBottom = shell.scrollTop + shell.clientHeight;
    if (rowBottom > visibleBottom) {
      shell.scrollTop = rowBottom - shell.clientHeight;
    } else if (rowTop < shell.scrollTop) {
      shell.scrollTop = rowTop;
    }
  }
  if (typeof row.scrollIntoView === 'function') {
    row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

export function captureYamlEditorScrollSnapshot(
  container: HTMLElement | null
): YamlEditorScrollSnapshot {
  const domainTables: Record<string, TableScrollPosition> = {};
  if (!container) {
    return { domainTables };
  }
  container.querySelectorAll<HTMLElement>('.yaml-domain-fields-shell').forEach((shell) => {
    const entryId = shell.closest<HTMLElement>('[data-domain-rule-id]')?.dataset.domainRuleId;
    if (entryId) {
      domainTables[entryId] = readScrollPosition(shell);
    }
  });
  const snapshot: YamlEditorScrollSnapshot = { domainTables };
  const fieldTable = container.querySelector<HTMLElement>('.stitch-yaml-config-table');
  if (fieldTable) {
    snapshot.fieldTable = readScrollPosition(fieldTable);
  }
  return snapshot;
}

export function restoreYamlEditorScrollSnapshot(
  container: HTMLElement | null,
  snapshot: YamlEditorScrollSnapshot,
  request?: YamlEditorRenderRequest
): void {
  if (!container) {
    return;
  }
  if (snapshot.fieldTable) {
    applyScrollPosition(
      container.querySelector<HTMLElement>('.stitch-yaml-config-table'),
      snapshot.fieldTable
    );
  }
  Object.entries(snapshot.domainTables).forEach(([entryId, position]) => {
    applyScrollPosition(
      findDomainRule(container, entryId)?.querySelector<HTMLElement>('.yaml-domain-fields-shell') ??
        null,
      position
    );
  });
  const row = request?.scrollTarget ? findScrollTarget(container, request.scrollTarget) : null;
  if (row) {
    scrollRowIntoTable(row);
  }
}
