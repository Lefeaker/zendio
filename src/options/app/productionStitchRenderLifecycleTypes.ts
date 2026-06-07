import type { Language } from '@i18n';
import type {
  PreviewContent,
  PreviewStoreState,
  SchemaContext,
  ViewSchema
} from '@options/stitch/types';

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
  getFooterMeta?(id: string): { openMode: 'modal' | 'page'; href?: string } | null;
  getFooterView?(id: string, ctx: SchemaContext): ViewSchema | null;
  getAppData(): PreviewContent;
  getCurrentLanguage(): Language;
  getSettingsView?(id: string, ctx: SchemaContext): ViewSchema | null;
  getState(): PreviewStoreState;
  setState(state: PreviewStoreState): void;
  createSchemaContext(): SchemaContext;
  dispatch(actionId: string, args?: unknown[], value?: unknown, event?: Event): void;
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
