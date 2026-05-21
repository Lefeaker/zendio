import { clear } from '@options/stitch/ui/dom';

interface ProductionStitchShellTeardownOptions {
  mountRoot: HTMLElement;
  buttonPressScrollGuard: { cleanup(): void };
  themeMediaQuery: Pick<MediaQueryList, 'removeEventListener'>;
  applySystemThemePreferenceChange(): void;
  schemaRenderer: { dispose(): void };
  widgetHost: { destroyWidgets(): void };
}

export function cleanupProductionStitchShell(options: ProductionStitchShellTeardownOptions): void {
  options.buttonPressScrollGuard.cleanup();
  options.themeMediaQuery.removeEventListener?.('change', options.applySystemThemePreferenceChange);
  options.schemaRenderer.dispose();
  options.widgetHost.destroyWidgets();
  clear(options.mountRoot);
}
