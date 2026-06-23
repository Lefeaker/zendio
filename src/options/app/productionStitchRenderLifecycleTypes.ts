import type { Language } from '@i18n';
import type {
  PreviewContent,
  PreviewStoreState,
  SchemaContext,
  ViewSchema
} from '@options/stitch/types';
import type { ProductionStitchAssetUrlResolver } from './productionStitchAssetUrlResolver';

export interface ProductionStitchRenderWidgetHost {
  createWidgetFactory(widgetType: string): unknown;
  destroyWidgets(): void;
  flushDirtyWidgets(): void;
  mountWidget(widgetType: string, host: HTMLElement): void;
}

export interface ProductionStitchSchemaRenderer {
  renderView(view: never): HTMLElement;
}

export interface ProductionStitchRenderLifecycleOptions {
  mountRoot: HTMLElement;
  getFooterMeta?(this: void, id: string): { openMode: 'modal' | 'page'; href?: string } | null;
  getFooterView?(this: void, id: string, ctx: SchemaContext): ViewSchema | null;
  getAppData(): PreviewContent;
  getCurrentLanguage(): Language;
  getSettingsView?(this: void, id: string, ctx: SchemaContext): ViewSchema | null;
  getState(): PreviewStoreState;
  setState(state: PreviewStoreState): void;
  createSchemaContext(): SchemaContext;
  dispatch(actionId: string, args?: unknown[], value?: unknown, event?: Event): void;
  resolveAssetUrl: ProductionStitchAssetUrlResolver;
  schemaRenderer: ProductionStitchSchemaRenderer;
  widgetHost: ProductionStitchRenderWidgetHost;
}

export interface ProductionStitchRenderLifecycle {
  applySystemThemePreferenceChange: () => void;
  cleanup: () => void;
  openResource: (resourceId: string) => void;
  render: () => void;
  renderActiveResourceModal: () => void;
  scrollToPanel: (panelId: string) => void;
  syncHighlightThemeControls: () => void;
  syncModifierControls: () => void;
  syncPreviewThemeControls: () => void;
}

export interface ProductionStitchTestAssets {
  getFooterMeta: NonNullable<ProductionStitchRenderLifecycleOptions['getFooterMeta']>;
  getFooterView: NonNullable<ProductionStitchRenderLifecycleOptions['getFooterView']>;
  getSettingsView: NonNullable<ProductionStitchRenderLifecycleOptions['getSettingsView']>;
}
