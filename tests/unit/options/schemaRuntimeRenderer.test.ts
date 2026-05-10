/* @vitest-environment jsdom */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSchemaRenderer } from '@options/schema-runtime/renderer';
import type { ViewSchema, WidgetMountContract } from '@options/schema-runtime/contracts';

describe('schema runtime renderer', () => {
  it('mounts widgets, injects runtime helpers, and destroys them on dispose', () => {
    const mountMock = vi.fn();
    const destroyMock = vi.fn();
    const dispatchMock = vi.fn();
    const mutateMock = vi.fn();
    const rerenderMock = vi.fn();
    const notifyDirtyMock = vi.fn();
    const reportErrorMock = vi.fn();

    let capturedRuntime: Parameters<
      WidgetMountContract<unknown, { ready: boolean }, { version: string }>['mount']
    >[2];

    const widget: WidgetMountContract<unknown, { ready: boolean }, { version: string }> = {
      mount(container, props, runtime) {
        capturedRuntime = runtime;
        mountMock(container, props);
      },
      update() {},
      destroy() {
        destroyMock();
      }
    };

    const renderer = createSchemaRenderer<{ ready: boolean }, { version: string }>({
      getContext: () => ({
        state: { ready: true },
        appData: { version: '1.0.0' }
      }),
      dispatch: dispatchMock,
      mutate: mutateMock,
      requestRerender: rerenderMock,
      notifyDirty: notifyDirtyMock,
      reportError: reportErrorMock,
      getWidgetFactory(widgetType) {
        return widgetType === 'fake' ? () => widget : null;
      }
    });

    const view = renderer.renderView({
      id: 'test',
      kind: 'page',
      children: [
        {
          kind: 'widget',
          widgetType: 'fake',
          props: { mode: 'demo' }
        }
      ]
    });

    expect(view.querySelector('.schema-widget-host')).toBeTruthy();
    expect(mountMock).toHaveBeenCalledWith(expect.any(HTMLDivElement), { mode: 'demo' });

    capturedRuntime?.dispatch('demo:action', 'value');
    capturedRuntime?.mutate(() => undefined);
    capturedRuntime?.requestRerender();
    capturedRuntime?.notifyDirty?.(['demo']);
    capturedRuntime?.reportError?.('demo', new Error('boom'));

    expect(dispatchMock).toHaveBeenCalledWith('demo:action', 'value');
    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(rerenderMock).toHaveBeenCalledTimes(1);
    expect(notifyDirtyMock).toHaveBeenCalledWith(['demo']);
    expect(reportErrorMock).toHaveBeenCalledWith('demo', expect.any(Error));

    renderer.dispose();
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  it('renders primary schema node variants and dispatches configured actions', () => {
    const dispatchMock = vi.fn();
    const state = { title: 'Runtime title', selected: 'b', enabled: true };
    const renderer = createSchemaRenderer<typeof state, { version: string }>({
      getContext: () => ({
        state,
        appData: { version: '2.0.0' }
      }),
      dispatch: dispatchMock,
      mutate: vi.fn(),
      requestRerender: vi.fn(),
      getWidgetFactory: () => null
    });

    const view: ViewSchema<typeof state, { version: string }> = {
      id: 'all-nodes',
      kind: 'standalone-page',
      hero: {
        title: { path: 'title' },
        description: ({ appData }) => `Version ${appData.version}`,
        pills: ['stable', 'stitch']
      },
      children: [
        'plain text',
        42,
        null,
        false,
        {
          kind: 'group',
          title: 'Group',
          children: [
            {
              kind: 'card',
              title: 'Card',
              description: 'Card description',
              actions: [
                { kind: 'button', label: 'Act', variant: 'primary', action: { id: 'card:act' } }
              ],
              children: [
                {
                  kind: 'row',
                  title: 'Row',
                  description: 'Row description',
                  control: [
                    {
                      kind: 'input',
                      bind: { path: 'title' },
                      placeholder: 'Title',
                      action: { id: 'title:update' }
                    },
                    {
                      kind: 'textarea',
                      value: 'Long copy',
                      disabled: false,
                      action: { id: 'copy:update' }
                    }
                  ]
                },
                {
                  kind: 'field',
                  label: 'Field',
                  control: {
                    kind: 'select',
                    bind: { path: 'selected' },
                    options: [
                      { value: 'a', label: 'A' },
                      { value: 'b', label: 'B' }
                    ],
                    action: { id: 'select:update' }
                  }
                },
                {
                  kind: 'switch',
                  bind: { path: 'enabled' },
                  stateText: 'Enabled',
                  action: { id: 'enabled:update' }
                }
              ]
            },
            {
              kind: 'stack',
              children: [
                { kind: 'notice', title: 'Notice', body: 'Helpful copy', variant: 'success' },
                {
                  kind: 'table',
                  columns: ['Name', 'Action'],
                  rows: [
                    {
                      className: 'primary-row',
                      cells: [
                        { text: 'Alpha', className: 'name-cell' },
                        { node: { kind: 'element', tag: 'span', text: 'Node cell' } },
                        { kind: 'button', label: 'Inline', action: { id: 'inline:click' } }
                      ]
                    }
                  ]
                },
                { kind: 'tokenRow', tokens: ['one', 'two'], action: { id: 'token:pick' } },
                {
                  kind: 'element',
                  tag: 'div',
                  className: 'custom-element',
                  attrs: { 'data-role': 'demo' },
                  html: '<span>HTML body</span>'
                },
                { kind: 'widget', widgetType: 'missing' }
              ]
            }
          ]
        }
      ]
    };

    const element = renderer.renderView(view);

    expect(element.className).toContain('standalone');
    expect(element.querySelector('.schema-hero-title')?.textContent).toBe('Runtime title');
    expect(element.querySelector('.schema-hero-description')?.textContent).toBe('Version 2.0.0');
    expect(element.querySelectorAll('.schema-hero-pill')).toHaveLength(2);
    expect(element.querySelector('.schema-card-header')).toBeTruthy();
    expect(element.querySelector('.schema-table-wrap')).toBeTruthy();
    expect(element.querySelector('.schema-token-row')).toBeTruthy();
    expect(element.querySelector('.custom-element')?.innerHTML).toBe('<span>HTML body</span>');
    expect(element.querySelector('.schema-widget-missing')?.textContent).toContain('missing');
    expect(element.querySelector<HTMLInputElement>('.schema-input')?.value).toBe('Runtime title');
    expect(element.querySelector<HTMLTextAreaElement>('.schema-textarea')?.value).toBe('Long copy');
    expect(element.querySelector<HTMLOptionElement>('option[value="b"]')?.selected).toBe(true);
    expect(element.querySelector<HTMLInputElement>('.schema-switch-input')?.checked).toBe(true);

    element.querySelector<HTMLButtonElement>('.schema-button')?.click();
    element.querySelector<HTMLInputElement>('.schema-input')?.dispatchEvent(new Event('input'));
    element
      .querySelector<HTMLTextAreaElement>('.schema-textarea')
      ?.dispatchEvent(new Event('input'));
    element.querySelector<HTMLSelectElement>('.schema-select')?.dispatchEvent(new Event('change'));
    element
      .querySelector<HTMLInputElement>('.schema-switch-input')
      ?.dispatchEvent(new Event('change'));
    element.querySelectorAll<HTMLButtonElement>('.schema-token')[1]?.click();

    expect(dispatchMock).toHaveBeenCalledWith({ id: 'card:act' });
    expect(dispatchMock).toHaveBeenCalledWith({ id: 'title:update' }, expect.any(Event));
    expect(dispatchMock).toHaveBeenCalledWith({ id: 'copy:update' }, expect.any(Event));
    expect(dispatchMock).toHaveBeenCalledWith({ id: 'select:update' }, expect.any(Event));
    expect(dispatchMock).toHaveBeenCalledWith({ id: 'enabled:update' }, expect.any(Event));
    expect(dispatchMock).toHaveBeenCalledWith({ id: 'token:pick' }, 'two');
  });

  it('renders optional and fallback branches without event handlers', () => {
    const renderer = createSchemaRenderer<{ missing?: string }, Record<string, never>>({
      getContext: () => ({ state: {}, appData: {} }),
      dispatch: vi.fn(),
      mutate: vi.fn(),
      requestRerender: vi.fn(),
      getWidgetFactory: () => null
    });

    const element = renderer.renderView({
      id: 'fallbacks',
      kind: 'page',
      hero: {
        title: ''
      },
      children: [
        {
          kind: 'card',
          children: [
            {
              kind: 'input',
              value: null as never,
              type: undefined,
              disabled: true
            },
            {
              kind: 'select',
              value: undefined,
              options: undefined as never,
              disabled: true
            },
            {
              kind: 'switch',
              checked: undefined,
              disabled: true
            },
            { kind: 'button', label: 'Passive' },
            { kind: 'notice', title: 'No body' },
            { kind: 'element', tag: 'p', text: 123 as never, children: 'child text' as never },
            { kind: 'unknown' } as never
          ]
        }
      ]
    });

    expect(element.querySelector('.schema-hero')).toBeNull();
    expect(element.querySelector('.schema-card-header')).toBeNull();
    expect(element.querySelector<HTMLInputElement>('.schema-input')?.disabled).toBe(true);
    expect(element.querySelector<HTMLSelectElement>('.schema-select')?.children).toHaveLength(0);
    expect(element.querySelector<HTMLInputElement>('.schema-switch-input')?.checked).toBe(false);
    expect(element.querySelector('.schema-notice')?.className).toContain('info');
    expect(element.querySelector('p')?.textContent).toContain('123');
  });

  it('renders modal views and honors custom render extensions', () => {
    const dispatchMock = vi.fn();
    const renderer = createSchemaRenderer<Record<string, never>, Record<string, never>>({
      getContext: () => ({ state: {}, appData: {} }),
      dispatch: dispatchMock,
      mutate: vi.fn(),
      requestRerender: vi.fn(),
      getWidgetFactory: () => null
    });

    const modal = renderer.renderView({
      id: 'modal',
      kind: 'modal',
      size: 'large',
      title: 'Modal title',
      description: 'Modal description',
      children: [{ kind: 'button', label: 'Inside', action: { id: 'inside:click' } }]
    });

    expect(modal.querySelector('[role="dialog"]')).toBeTruthy();
    modal.click();
    modal.querySelector<HTMLDivElement>('.schema-modal')?.click();
    modal.querySelector<HTMLButtonElement>('.schema-modal-close')?.click();

    expect(dispatchMock).toHaveBeenCalledWith('resource:close');
    expect(dispatchMock).toHaveBeenCalledTimes(2);

    const custom = document.createElement('section');
    custom.className = 'custom-view';
    const customRenderer = createSchemaRenderer<Record<string, never>, Record<string, never>>(
      {
        getContext: () => ({ state: {}, appData: {} }),
        dispatch: vi.fn(),
        mutate: vi.fn(),
        requestRerender: vi.fn(),
        getWidgetFactory: () => null
      },
      { renderView: () => custom }
    );

    expect(customRenderer.renderView({ id: 'custom', kind: 'page' })).toBe(custom);
  });

  it('collects widget snapshots while reporting collect and dispose errors', () => {
    const reportErrorMock = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const renderer = createSchemaRenderer<Record<string, never>, Record<string, never>>({
      getContext: () => ({ state: {}, appData: {} }),
      dispatch: vi.fn(),
      mutate: vi.fn(),
      requestRerender: vi.fn(),
      reportError: reportErrorMock,
      getWidgetFactory(widgetType) {
        if (widgetType === 'collectable') {
          return () => ({
            mount() {},
            update() {},
            destroy() {},
            collect: () => ({ ok: true })
          });
        }
        if (widgetType === 'silent') {
          return () => ({
            mount() {},
            update() {},
            destroy() {},
            collect: () => undefined
          });
        }
        if (widgetType === 'passive') {
          return () => ({
            mount() {},
            update() {},
            destroy() {}
          });
        }
        return () => ({
          mount() {},
          update() {},
          destroy() {
            throw new Error('destroy failed');
          },
          collect() {
            throw new Error('collect failed');
          }
        });
      }
    });

    renderer.renderView({
      id: 'widgets',
      kind: 'page',
      children: [
        { kind: 'widget', widgetType: 'collectable' },
        { kind: 'widget', widgetType: 'silent' },
        { kind: 'widget', widgetType: 'passive' },
        { kind: 'widget', widgetType: 'throwing' }
      ]
    });

    expect(renderer.collectWidgetState()).toEqual([{ ok: true }]);
    expect(reportErrorMock).toHaveBeenCalledWith('collect', expect.any(Error));

    renderer.dispose();
    expect(warnSpy).toHaveBeenCalledWith(
      '[SchemaRenderer] Failed to destroy widget instance:',
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  it('keeps the preview fixture wired to the shared renderer and removes parallel preview core files', () => {
    const runtimeSource = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/options-preview/app/runtime.ts'),
      'utf8'
    );
    const sharedUiSource = readFileSync(
      resolve(process.cwd(), 'src/options/stitch/ui/components.ts'),
      'utf8'
    );

    expect(runtimeSource).toContain('@options/schema-runtime/renderer');
    expect(runtimeSource).not.toContain('../renderer/schemaRenderer');
    expect(
      existsSync(resolve(process.cwd(), 'tests/fixtures/options-preview/ui/components.ts'))
    ).toBe(false);
    expect(sharedUiSource).not.toMatch(/from ['"]lucide['"]/);
    expect(
      existsSync(resolve(process.cwd(), 'tests/fixtures/options-preview/schema/contracts/index.ts'))
    ).toBe(false);
    expect(
      existsSync(
        resolve(process.cwd(), 'tests/fixtures/options-preview/renderer/schemaRenderer.ts')
      )
    ).toBe(false);
  });
});
