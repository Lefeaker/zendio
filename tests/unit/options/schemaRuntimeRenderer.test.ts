/* @vitest-environment jsdom */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSchemaRenderer } from '@options/schema-runtime/renderer';
import type { WidgetMountContract } from '@options/schema-runtime/contracts';

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

  it('keeps preview wired to the shared renderer and removes parallel preview core files', () => {
    const runtimeSource = readFileSync(
      resolve(process.cwd(), 'src/options/preview/app/runtime.ts'),
      'utf8'
    );
    const sharedUiSource = readFileSync(
      resolve(process.cwd(), 'src/options/stitch/ui/components.ts'),
      'utf8'
    );

    expect(runtimeSource).toContain('@options/schema-runtime/renderer');
    expect(runtimeSource).not.toContain('../renderer/schemaRenderer');
    expect(existsSync(resolve(process.cwd(), 'src/options/preview/ui/components.ts'))).toBe(false);
    expect(sharedUiSource).not.toMatch(/from ['"]lucide['"]/);
    expect(
      existsSync(resolve(process.cwd(), 'src/options/preview/schema/contracts/index.ts'))
    ).toBe(false);
    expect(
      existsSync(resolve(process.cwd(), 'src/options/preview/renderer/schemaRenderer.ts'))
    ).toBe(false);
  });
});
