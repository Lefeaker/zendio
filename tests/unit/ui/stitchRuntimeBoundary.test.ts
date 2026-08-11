/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createRuntimeExtensionRendererRegistry,
  el,
  renderRuntimeNode,
  renderRuntimeSurface,
  resolveRuntimeBinding,
  surfaceComponents,
  type NodeSchema,
  type RuntimeButtonNode,
  type RuntimeElementNode,
  type RuntimeExtensionRendererRegistry,
  type RuntimeNodeChild,
  type RuntimeNodeSchema,
  type RuntimeSurfaceContent,
  type RuntimeSurfaceContext,
  type RuntimeViewSchema
} from '@ui/stitch-runtime';
import { getSurfaceView } from '@ui/stitch-surfaces';
import {
  buttonNode as runtimeButtonNode,
  div as runtimeDiv,
  element as runtimeElement,
  span as runtimeSpan,
  strong as runtimeStrong
} from '@ui/stitch-surfaces/builders/primitives';
import * as surfaceChrome from '@ui/stitch-surfaces/builders/surfaceChrome';
import * as surfaceSessionItems from '@ui/stitch-surfaces/builders/surfaceSessionItems';
import * as videoSurfaces from '@ui/stitch-surfaces/builders/videoSurfaces';
import * as surfaceBuilders from '@ui/stitch-surfaces/builders/surfaces';
import {
  clipperClassNames,
  runtimeClassNames,
  sessionClassNames,
  surfaceClassNames
} from '@ui/stitch-surfaces/builders/classNames';
import { classNames as optionsClassNames } from '@options/stitch/schema/builders/classNames';
import {
  div as optionsDiv,
  element as optionsElement
} from '@options/stitch/schema/builders/primitives';
import type { RendererContext } from '@options/stitch/render/actionAdapter';
import type {
  NodeSchema as OptionsNodeSchema,
  OptionsExtensionNode,
  SchemaContext
} from '@options/stitch/types';
import { createTaskSuccessSurfaceContent } from '@content/stitch/runtimeSurfaceContent';

const CHROME_EXPORTS = [
  'actionRow',
  'exportDestinationRow',
  'sessionFooterBar',
  'sessionHeader',
  'sessionItemList',
  'sessionPanelShell',
  'surfaceBody',
  'surfaceBrand',
  'surfaceFooter',
  'surfaceStage',
  'surfaceWindow'
];
const SESSION_ITEM_EXPORTS = [
  'sessionItemCard',
  'sessionItemCloseButton',
  'sessionItemMarker',
  'videoTimestampMarker'
];
const VIDEO_EXPORTS = ['videoAddCaptureItem', 'videoCaptureItem', 'videoFooterBar'];
const EXCLUDED_EXPORTS = [
  'surfaceHeader',
  'runtimeList',
  'runtimeMeta',
  'runtimeCommentBox',
  'surfaceActions',
  'sessionStatusStrip',
  'linkedContentFooter',
  'sessionPlaceholderItem'
];

const NEUTRAL_CLASS_KEYS = [
  'surface.stage',
  'surface.window',
  'surface.windowHeader',
  'surface.windowBody',
  'surface.windowFooter',
  'surface.windowBrand',
  'surface.windowIcon',
  'surface.windowTitle',
  'surface.windowSubtitle',
  'surface.headingCopy',
  'surface.actionRow',
  'clipper.shell',
  'clipper.body',
  'clipper.previewBlock',
  'clipper.preview',
  'clipper.textarea',
  'clipper.sourceRow',
  'clipper.sourceBadge',
  'clipper.sourceMeta',
  'clipper.sourceStatus',
  'clipper.footerBar',
  'clipper.footerSecondary',
  'clipper.footerPrimary',
  'session.bodyReader',
  'session.bodyVideo',
  'session.panelRail',
  'session.resizeHandle',
  'session.heightResizeHandle',
  'session.list',
  'session.item',
  'session.readerItem',
  'session.addCaptureItem',
  'session.marker',
  'session.markerTime',
  'session.markerIndex',
  'session.addCaptureButton',
  'session.collapseTrigger',
  'session.content',
  'session.readerContent',
  'session.readerSelection',
  'session.readerNoteInput',
  'session.itemCloseTrigger',
  'session.commentInput',
  'session.footerCounter',
  'session.footerBar',
  'session.footerActions'
].sort();

const OPTIONS_CLASS_KEYS = [
  'resource.modalSection',
  'resource.modalSectionTitle',
  'resource.modalSectionHead',
  'yaml.filterRow',
  'yaml.filter',
  'yaml.active',
  'yaml.check',
  'yaml.checkOn',
  'yaml.domainRule',
  'yaml.ruleMeta',
  'yaml.groupRow',
  'table.centerCell',
  'common.emptyState',
  'common.outputBox',
  'common.surfaceHelperText',
  'settings.interfaceThemeGrid',
  'settings.aiPlatformLinkRow',
  'settings.aiPlatformLink'
].sort();

const EXCLUDED_CLASS_KEYS = [
  'surface.windowIconGlyph',
  'surface.windowHeaderAction',
  'surface.windowExit',
  'surface.windowExitTrigger',
  'surface.exitPopover',
  'surface.exitPopoverTitle',
  'surface.exitPopoverActions',
  'surface.pillRow',
  'surface.actionRowCompact',
  'surface.previewGrid',
  'surface.statusStrip',
  'surface.summaryStrip',
  'surface.summaryText',
  'surface.linkedCard',
  'surface.linkedThumb',
  'surface.linkedCopy',
  'resource.modalStack',
  'runtime.list',
  'runtime.item',
  'runtime.itemHead',
  'runtime.indexButton',
  'runtime.summary',
  'runtime.deleteButton',
  'runtime.editor',
  'runtime.meta',
  'runtime.metaLink',
  'runtime.commentBox',
  'yaml.domainGrid',
  'yaml.actions',
  'yaml.helper',
  'common.mtBlock',
  'session.shellReader',
  'session.shellVideo',
  'session.itemText',
  'session.itemEditor',
  'session.metaRow',
  'session.linkedSection',
  'session.linkedTitle',
  'session.linkedMeta',
  'session.linkedAction',
  'session.linkedThumbPlay'
].sort();

function runtimeContext(): RuntimeSurfaceContext {
  return {
    appData: createTaskSuccessSurfaceContent(),
    state: { previewTheme: 'dark' }
  };
}

function rendererContext() {
  return {
    ...runtimeContext(),
    el,
    ui: surfaceComponents,
    dispatch: vi.fn()
  };
}

function nestedKeys(groups: Record<string, Record<string, unknown>>): string[] {
  return Object.entries(groups)
    .flatMap(([group, entries]) => Object.keys(entries).map((key) => `${group}.${key}`))
    .sort();
}

function compileOptionsExtensionNode(
  registry: RuntimeExtensionRendererRegistry<RendererContext, OptionsExtensionNode>,
  node: OptionsExtensionNode,
  ctx: RendererContext
): Node | null {
  return registry.render(node, ctx);
}
void compileOptionsExtensionNode;

type Assert<Type extends true> = Type;
type IsEqual<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;

const compileNeutralSpan = runtimeSpan('compile-neutral-copy', 'copy');
const compileNeutralStrong = runtimeStrong('strong');
const compileOptionalVariantButton = runtimeButtonNode('action', (current) =>
  current.state.previewTheme === 'dark' ? 'primary' : undefined
);
const compileNeutralElement = runtimeElement('section', {}, [
  compileNeutralSpan,
  compileNeutralStrong,
  (current) =>
    current.state.previewTheme === 'dark' ? runtimeElement('em', { text: 'dark' }) : null,
  () => false,
  () => undefined
]);
const compileNeutralNestedElement = runtimeDiv('compile-neutral-root', [
  compileNeutralElement,
  compileOptionalVariantButton
]);
const compileNeutralScalarDiv = runtimeDiv('compile-neutral-scalar', ['counter']);
const compileNeutralNestedScalarDiv = runtimeDiv('compile-neutral-scalar-parent', [
  runtimeDiv('compile-neutral-scalar-child', ['nested counter'])
]);
const compileNeutralScalarChild: RuntimeNodeChild<RuntimeSurfaceContext, never> = runtimeDiv(
  'compile-neutral-scalar-child-contract',
  ['child']
);
const compileNeutralChildren: RuntimeNodeChild<RuntimeSurfaceContext, never>[] = [
  compileNeutralNestedElement,
  runtimeElement('span', { text: 'child' })
];
void compileNeutralScalarChild;
void compileNeutralChildren;

const compileOptionsExtensionElement = optionsDiv('compile-options-root', [
  {
    kind: 'field',
    label: (current) => current.language ?? 'Language',
    control: optionsElement('input', { type: 'text' })
  },
  {
    kind: 'field',
    label: 'Theme',
    control: optionsElement('input', { type: 'text' })
  },
  {
    kind: 'list',
    items: (current) => [current.language ?? 'default']
  },
  {
    kind: 'list',
    items: ['static']
  },
  {
    kind: 'table',
    columns: (current) => [current.language ?? 'Column'],
    rows: () => []
  }
]);
const compileSchemaContextChildren = (current: SchemaContext): OptionsNodeSchema[] => [
  optionsElement('span', { text: current.language ?? 'default' })
];
const compileOptionsCallbackElement = optionsDiv(
  'compile-options-callback',
  compileSchemaContextChildren
);
function compileRendererContextInheritance(current: RendererContext): OptionsNodeSchema[] {
  return compileSchemaContextChildren(current);
}
void compileOptionsCallbackElement;
void compileRendererContextInheritance;

const compilePrimitiveReturnAssertions: [
  Assert<
    IsEqual<typeof compileNeutralNestedElement, RuntimeElementNode<RuntimeSurfaceContext, never>>
  >,
  Assert<IsEqual<typeof compileNeutralScalarDiv, RuntimeElementNode<RuntimeSurfaceContext, never>>>,
  Assert<
    IsEqual<typeof compileNeutralNestedScalarDiv, RuntimeElementNode<RuntimeSurfaceContext, never>>
  >,
  Assert<
    typeof compileNeutralScalarDiv extends RuntimeNodeChild<RuntimeSurfaceContext, never>
      ? true
      : false
  >,
  Assert<IsEqual<typeof compileNeutralElement, RuntimeElementNode<RuntimeSurfaceContext, never>>>,
  Assert<IsEqual<typeof compileNeutralSpan, RuntimeElementNode<RuntimeSurfaceContext>>>,
  Assert<IsEqual<typeof compileNeutralStrong, RuntimeElementNode<RuntimeSurfaceContext>>>,
  Assert<IsEqual<typeof compileOptionalVariantButton, RuntimeButtonNode<RuntimeSurfaceContext>>>,
  Assert<
    IsEqual<
      typeof compileOptionsExtensionElement,
      RuntimeElementNode<SchemaContext, OptionsExtensionNode>
    >
  >
] = [true, true, true, true, true, true, true, true, true];
void compilePrimitiveReturnAssertions;

const compileRuntimeContractAssertions: [
  Assert<{} extends Pick<RuntimeSurfaceContent['taskSuccess'], 'supportChannels'> ? false : true>,
  Assert<{} extends Pick<RuntimeSurfaceContent['taskSuccess'], 'defaultVaultName'> ? true : false>,
  Assert<'resources' extends keyof RuntimeSurfaceContent ? false : true>,
  Assert<'storage' extends keyof RuntimeSurfaceContent ? false : true>,
  Assert<
    ((ctx: SchemaContext) => string) extends (ctx: RuntimeSurfaceContext) => string ? false : true
  >,
  Assert<IsEqual<OptionsNodeSchema, RuntimeNodeSchema<SchemaContext, OptionsExtensionNode>>>,
  Assert<'page' extends RuntimeViewSchema<RuntimeSurfaceContext>['kind'] ? false : true>
] = [true, true, true, true, true, true, true];
void compileRuntimeContractAssertions;

describe('neutral Stitch runtime boundary', () => {
  it('renders every core kind with the narrow runtime context', () => {
    const nodes: NodeSchema[] = [
      { kind: 'element', tag: 'span', text: 'element' },
      { kind: 'input', value: 'input' },
      { kind: 'textarea', value: 'textarea' },
      { kind: 'button', label: 'button' },
      { kind: 'badge', label: 'badge' },
      { kind: 'pill', label: 'pill' }
    ];

    const rendered = nodes.map((node) => renderRuntimeNode(node, rendererContext()));
    expect(rendered.every((node) => node instanceof Node)).toBe(true);
    expect(rendered.map((node) => node?.nodeName)).toEqual([
      'SPAN',
      'INPUT',
      'TEXTAREA',
      'BUTTON',
      'SPAN',
      'SPAN'
    ]);
  });

  it('rejects duplicate and unknown extension renderer kinds', () => {
    type ExtensionNode = { kind: 'known'; label: string } | { kind: 'unknown'; label: string };
    const registry = createRuntimeExtensionRendererRegistry<RuntimeSurfaceContext, ExtensionNode>();
    registry.register('known', (node) =>
      node.kind === 'known' ? document.createTextNode(node.label) : null
    );

    expect(() => registry.register('known', () => null)).toThrow(
      'Duplicate runtime extension renderer kind: known'
    );
    expect(() => registry.render({ kind: 'unknown', label: 'x' }, runtimeContext())).toThrow(
      'Unregistered runtime node kind: unknown'
    );
    expect(() =>
      renderRuntimeNode<RuntimeSurfaceContext, ExtensionNode>(
        { kind: 'unknown', label: 'x' },
        rendererContext()
      )
    ).toThrow('Unregistered runtime node kind: unknown');
  });

  it('attaches core control actions only when declared and preserves input click prevention', () => {
    const ctx = rendererContext();
    const passive = renderRuntimeNode({ kind: 'input', value: 'passive' }, ctx);
    const active = renderRuntimeNode(
      { kind: 'input', value: 'active', onClick: { id: 'input:click' } },
      ctx
    );
    if (!(passive instanceof HTMLInputElement) || !(active instanceof HTMLInputElement)) {
      throw new Error('runtime inputs did not render');
    }
    const passiveClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    const activeClick = new MouseEvent('click', { bubbles: true, cancelable: true });

    passive.dispatchEvent(passiveClick);
    active.dispatchEvent(activeClick);

    expect(passiveClick.defaultPrevented).toBe(false);
    expect(activeClick.defaultPrevented).toBe(true);
    expect(ctx.dispatch).toHaveBeenCalledWith('input:click', [], activeClick, activeClick);
  });

  it('resolves inherited and getter-backed runtime binding paths', () => {
    class BindingState {
      get inheritedValue(): string {
        return 'resolved';
      }
    }
    const ctx = { appData: {}, state: new BindingState() };

    expect(resolveRuntimeBinding({ path: 'inheritedValue' }, ctx)).toBe('resolved');
  });

  it('renders task-success from only six surfaces and previewTheme', () => {
    const ctx = runtimeContext();
    const view = getSurfaceView('task-success', ctx);
    if (!view) throw new Error('task-success view missing');

    const rendered = renderRuntimeSurface(view, rendererContext());

    expect(Object.keys(ctx.appData)).toHaveLength(6);
    expect(Object.keys(ctx.state)).toEqual(['previewTheme']);
    expect(rendered.querySelector('.task-support-strip')).toBeTruthy();
  });

  it('locks direct builder exports and rejects every dead export', () => {
    expect(Object.keys(surfaceChrome).sort()).toEqual(CHROME_EXPORTS);
    expect(Object.keys(surfaceSessionItems).sort()).toEqual(SESSION_ITEM_EXPORTS);
    expect(Object.keys(videoSurfaces).sort()).toEqual(VIDEO_EXPORTS);
    EXCLUDED_EXPORTS.forEach((name) => {
      expect(surfaceBuilders).not.toHaveProperty(name);
    });
  });

  it('keeps the neutral component capability exact and excludes Options charts', () => {
    expect(Object.keys(surfaceComponents).sort()).toEqual([
      'Badge',
      'Button',
      'Input',
      'Pill',
      'Textarea'
    ]);
    expect(surfaceComponents).not.toHaveProperty('renderUsageChart');
    expect(surfaceComponents).not.toHaveProperty('Select');
    expect(surfaceComponents).not.toHaveProperty('Card');
  });

  it('locks the 46 neutral and 18 Options class-name keys with all exclusions absent', () => {
    expect(nestedKeys(runtimeClassNames)).toEqual(NEUTRAL_CLASS_KEYS);
    expect(optionsClassNames.surface).toBe(surfaceClassNames);
    expect(optionsClassNames.clipper).toBe(clipperClassNames);
    expect(optionsClassNames.session).toBe(sessionClassNames);
    const optionsOwned = {
      resource: optionsClassNames.resource,
      yaml: optionsClassNames.yaml,
      table: optionsClassNames.table,
      common: optionsClassNames.common,
      settings: optionsClassNames.settings
    };
    expect(nestedKeys(optionsOwned)).toEqual(OPTIONS_CLASS_KEYS);

    const allKeys = new Set([...nestedKeys(runtimeClassNames), ...nestedKeys(optionsClassNames)]);
    EXCLUDED_CLASS_KEYS.forEach((key) => expect(allKeys.has(key)).toBe(false));
    expect(optionsClassNames).not.toHaveProperty('runtime');
  });

  it('requires a normalized non-empty icon and emits only the image brand path', () => {
    expect(() => surfaceChrome.surfaceBrand('', 'Title', null)).toThrow(
      'Runtime surface iconUrl must be non-empty'
    );
    expect(() => surfaceChrome.surfaceBrand('   ', 'Title', null)).toThrow(
      'Runtime surface iconUrl must be non-empty'
    );

    const rendered = renderRuntimeNode(
      surfaceChrome.surfaceBrand('  icons/runtime.png  ', 'Title', null),
      rendererContext()
    );
    if (!(rendered instanceof HTMLElement)) throw new Error('surface brand did not render');
    const image = rendered.querySelectorAll<HTMLImageElement>('img.surface-window-icon-image');
    expect(image).toHaveLength(1);
    expect(image[0]?.getAttribute('src')).toBe('icons/runtime.png');
    expect(image[0]?.getAttribute('alt')).toBe('');
    expect(rendered.querySelector('.surface-window-icon-glyph')).toBeNull();
  });

  it('does not recreate the ClassNames compatibility type', () => {
    const neutralSource = readFileSync(
      resolve(process.cwd(), 'src/ui/stitch-surfaces/builders/classNames.ts'),
      'utf8'
    );
    const optionsSource = readFileSync(
      resolve(process.cwd(), 'src/options/stitch/schema/builders/classNames.ts'),
      'utf8'
    );

    expect(neutralSource).not.toMatch(/\b(type|interface)\s+ClassNames\b/);
    expect(optionsSource).not.toMatch(/\b(type|interface)\s+ClassNames\b/);
  });

  it('keeps content callers on direct neutral surface projections', () => {
    const rendererSource = readFileSync(
      resolve(process.cwd(), 'src/content/stitch/runtimeSurfaceRenderer.ts'),
      'utf8'
    );
    const contentSource = readFileSync(
      resolve(process.cwd(), 'src/content/stitch/runtimeSurfaceContent.ts'),
      'utf8'
    );
    const supportPromptSource = readFileSync(
      resolve(process.cwd(), 'src/content/ui/supportPrompt.ts'),
      'utf8'
    );

    expect(rendererSource).not.toMatch(/Preview(Content|StoreState)/);
    expect(contentSource).not.toMatch(/Preview(Content|StoreState)/);
    expect(supportPromptSource).toContain('appData.taskSuccess =');
    expect(supportPromptSource).toContain('options?.vaultName?.trim()');
    expect(supportPromptSource).not.toContain('appData.surfaces');
    expect(supportPromptSource).not.toContain('appData.resources');
    expect(supportPromptSource).not.toContain('appData.storage');
  });

  it('keeps task-success and the neutral renderer free of Options-only data and node kinds', () => {
    const taskSuccessSource = readFileSync(
      resolve(process.cwd(), 'src/ui/stitch-surfaces/surfaces/task-success.ts'),
      'utf8'
    );
    const rendererSource = readFileSync(
      resolve(process.cwd(), 'src/ui/stitch-runtime/render/nodeRenderers.ts'),
      'utf8'
    );
    const optionsSchemaTypesSource = readFileSync(
      resolve(process.cwd(), 'src/options/stitch/types/schemaTypes.ts'),
      'utf8'
    );

    expect(taskSuccessSource).not.toContain('resources.support.channels');
    expect(taskSuccessSource).not.toContain('storage.vaults');
    [
      "case 'group'",
      "case 'select'",
      "case 'usageChart'",
      "case 'resourceCard'",
      "case 'widget'"
    ].forEach((kind) => expect(rendererSource).not.toContain(kind));
    expect(optionsSchemaTypesSource).toMatch(
      /export type NodeSchema\s*=\s*RuntimeNodeSchema<SchemaContext, OptionsExtensionNode>/
    );
    expect(optionsSchemaTypesSource).not.toMatch(/export type NodeSchema\s*=\s*\|/);
    ['InputNode', 'TextareaNode', 'ButtonNode', 'BadgeNode', 'PillNode'].forEach((name) => {
      expect(optionsSchemaTypesSource).not.toMatch(new RegExp(`interface\\s+${name}\\b`));
    });
  });
});
