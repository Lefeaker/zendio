/* @vitest-environment jsdom */

import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n';
import * as productionStitchShellContextModule from '@options/app/productionStitchShellContext';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { getSettingsView } from '@options/stitch/schema/registry';
import type {
  GroupNode,
  NodeChild,
  RowNode,
  SchemaContext,
  SelectNode,
  SwitchNode,
  ViewSchema
} from '@options/stitch/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asOptionsController,
  createController,
  queryRequired,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

const ENGLISH_SENTINEL_MESSAGES: Messages = {
  ...DEFAULT_RUNTIME_MESSAGES,
  schemaCaptureBehaviorReadingGroupTitle: 'Reading Group Sentinel',
  schemaCaptureBehaviorFragmentGroupTitle: 'Fragment Group Sentinel',
  readingExportModeLabel: 'Export Row Sentinel',
  readingExportModeHighlights: 'Highlights Sentinel',
  readingExportModeFull: 'Full Sentinel',
  fragmentKeyboardShortcutsLabel: 'Shortcuts Row Sentinel',
  schemaCommonEnabledState: 'Enabled Sentinel',
  schemaCommonDisabledState: 'Disabled Sentinel'
};

describe('mountProductionStitchShell capture behavior i18n', () => {
  beforeEach(setupProductionStitchShellTest);

  it('reads capture behavior group titles, export labels, and shortcut states from messages', () => {
    const schemaContextSpy = vi.spyOn(
      productionStitchShellContextModule,
      'createProductionStitchSchemaContext'
    );

    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: {
        fragmentClipper: {
          keyboardShortcutsEnabled: true
        }
      },
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'en'
    });

    queryRequired<HTMLButtonElement>('[data-nav-panel="capture-behavior"]').click();

    const schemaContext = schemaContextSpy.mock.results.at(-1)?.value as SchemaContext | undefined;
    const requiredSchemaContext = requireSchemaContext(schemaContext);
    const captureBehaviorView = requireCaptureBehaviorView(requiredSchemaContext);
    const readingGroup = requireGroup(captureBehaviorView, 'Reading Group Sentinel');
    const fragmentGroup = requireGroup(captureBehaviorView, 'Fragment Group Sentinel');
    const exportRow = requireRow(readingGroup, 'Export Row Sentinel');
    const shortcutsRow = requireRow(fragmentGroup, 'Shortcuts Row Sentinel');

    expect(readingGroup.title).toBe('Reading Group Sentinel');
    expect(fragmentGroup.title).toBe('Fragment Group Sentinel');
    expect(requireSelect(exportRow).options).toEqual([
      { value: 'highlights', label: 'Highlights Sentinel' },
      { value: 'full', label: 'Full Sentinel' }
    ]);

    const shortcutsSwitch = requireSwitch(shortcutsRow);
    expect(resolveSwitchStateText(shortcutsSwitch, requiredSchemaContext, true)).toBe(
      'Enabled Sentinel'
    );
    expect(resolveSwitchStateText(shortcutsSwitch, requiredSchemaContext, false)).toBe(
      'Disabled Sentinel'
    );
  });
});

function requireSchemaContext(ctx: SchemaContext | undefined): SchemaContext {
  if (ctx === undefined) {
    throw new Error('Missing schema context from mounted production shell');
  }
  return ctx;
}

function requireCaptureBehaviorView(ctx: SchemaContext): ViewSchema {
  const view = getSettingsView('capture-behavior', ctx);
  if (!view) {
    throw new Error('Missing capture-behavior schema view');
  }
  return view;
}

function requireGroup(view: ViewSchema, title: string): GroupNode {
  const group = asArray(view.children as NodeChild[] | undefined).find(
    (node): node is GroupNode => isNodeKind(node, 'group') && node.title === title
  );
  if (!group) {
    throw new Error(`Missing group: ${title}`);
  }
  return group;
}

function requireRow(group: GroupNode, title: string): RowNode {
  const row = collectNodes(group.children as unknown as NodeChild[] | undefined).find(
    (node): node is RowNode => isNodeKind(node, 'row') && node.title === title
  );
  if (!row) {
    throw new Error(`Missing row: ${title}`);
  }
  return row;
}

function requireSelect(row: RowNode): SelectNode {
  const select = collectNodes(row.control).find((node): node is SelectNode =>
    isNodeKind(node, 'select')
  );
  if (!select) {
    throw new Error(`Missing select control for row: ${String(row.title)}`);
  }
  return select;
}

function requireSwitch(row: RowNode): SwitchNode {
  const switchNode = collectNodes(row.control).find((node): node is SwitchNode =>
    isNodeKind(node, 'switch')
  );
  if (!switchNode) {
    throw new Error(`Missing switch control for row: ${String(row.title)}`);
  }
  return switchNode;
}

function resolveSwitchStateText(
  switchNode: SwitchNode,
  ctx: SchemaContext,
  enabled: boolean
): string {
  if (typeof switchNode.stateText !== 'function') {
    throw new Error('Expected shortcut switch to expose a dynamic stateText');
  }

  return switchNode.stateText({
    ...ctx,
    state: {
      ...ctx.state,
      fragmentKeyboardShortcutsEnabled: enabled
    }
  });
}

function collectNodes(root: NodeChild | NodeChild[] | undefined): NodeChild[] {
  const nodes: NodeChild[] = [];

  for (const node of asArray(root)) {
    if (
      !node ||
      typeof node === 'string' ||
      typeof node === 'number' ||
      typeof node === 'boolean'
    ) {
      continue;
    }
    if (node instanceof HTMLElement) {
      continue;
    }

    nodes.push(node);
    const traversable = node as unknown as Record<string, NodeChild | NodeChild[] | undefined>;
    nodes.push(...collectNodes(traversable.children));
    nodes.push(...collectNodes(traversable.body));
    nodes.push(...collectNodes(traversable.items));
    nodes.push(...collectNodes(traversable.control));
    nodes.push(...collectNodes(traversable.content));
  }

  return nodes;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function isNodeKind<TKind extends string>(
  value: NodeChild,
  kind: TKind
): value is Extract<NodeChild, { kind: TKind }> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof HTMLElement) &&
    'kind' in value &&
    value.kind === kind
  );
}
