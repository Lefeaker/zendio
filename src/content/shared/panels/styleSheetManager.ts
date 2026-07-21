import { loadExtensionStyle } from '../../clipper/shared/styleRegistry';
import {
  createManagedStyleSheet,
  ManagedShadowStyleHost,
  supportsAdoptedStyleSheets,
  type ManagedStyleEntry,
  type StyleAttachmentHandle
} from '@ui/foundation/style-host';

const PANEL_STITCH_RUNTIME_KEY = 'panel-stitch-runtime';
const PANEL_STITCH_SECONDARY_RUNTIME_KEY = 'panel-stitch-secondary-runtime';

class PanelStyleSheetManager {
  private static instance: PanelStyleSheetManager | null = null;
  private readonly styleHost = new ManagedShadowStyleHost();
  private initialized = false;
  private assetGeneration = 0;
  private stitchPendingLoad: Promise<boolean> | null = null;
  private stitchSheet: CSSStyleSheet | null = null;
  private stitchSecondarySheet: CSSStyleSheet | null = null;
  private stitchStyles: string | null = null;
  private stitchSecondaryStyles: string | null = null;

  static getInstance(): PanelStyleSheetManager {
    if (!PanelStyleSheetManager.instance) {
      PanelStyleSheetManager.instance = new PanelStyleSheetManager();
    }
    return PanelStyleSheetManager.instance;
  }

  initialize(): Promise<void> {
    if (this.initialized) {
      return this.whenStitchStylesReady();
    }
    this.initialized = true;
    return this.loadStitchStyles().then(() => undefined);
  }

  whenVideoStylesReady(): Promise<void> {
    return Promise.resolve();
  }

  whenStitchStylesReady(): Promise<void> {
    return this.stitchPendingLoad?.then(() => undefined) ?? Promise.resolve();
  }

  applyReaderStyles(root: ShadowRoot): StyleAttachmentHandle {
    return this.attachStitchStyles(root);
  }

  applyVideoStyles(root: ShadowRoot): StyleAttachmentHandle {
    return this.attachStitchStyles(root);
  }

  applyStitchRuntimeStyles(root: ShadowRoot): StyleAttachmentHandle {
    return this.attachStitchStyles(root);
  }

  destroy(): void {
    this.styleHost.destroy();
    this.assetGeneration += 1;
    this.stitchPendingLoad = null;
    this.stitchSheet = null;
    this.stitchSecondarySheet = null;
    this.stitchStyles = null;
    this.stitchSecondaryStyles = null;
    this.initialized = false;
  }

  getRegistrationCount(): number {
    return this.styleHost.getRegistrationCount();
  }

  private attachStitchStyles(root: ShadowRoot): StyleAttachmentHandle {
    if (!this.initialized) {
      void this.initialize();
    }
    const loaded = this.stitchStyles !== null && this.stitchSecondaryStyles !== null;
    return this.styleHost.attach(
      root,
      loaded ? this.getLoadedEntries() : () => this.getStitchEntries()
    );
  }

  private async getStitchEntries(): Promise<readonly ManagedStyleEntry[]> {
    if (!(await this.loadStitchStyles())) {
      throw new Error('Panel style assets are unavailable');
    }
    return this.getLoadedEntries();
  }

  private getLoadedEntries(): readonly ManagedStyleEntry[] {
    return [
      {
        key: PANEL_STITCH_RUNTIME_KEY,
        cssText: this.stitchStyles ?? '',
        sheet: this.stitchSheet
      },
      {
        key: PANEL_STITCH_SECONDARY_RUNTIME_KEY,
        cssText: this.stitchSecondaryStyles ?? '',
        sheet: this.stitchSecondarySheet
      }
    ];
  }

  private loadStitchStyles(): Promise<boolean> {
    if (this.stitchStyles !== null && this.stitchSecondaryStyles !== null) {
      return Promise.resolve(true);
    }
    if (this.stitchPendingLoad) {
      return this.stitchPendingLoad;
    }

    const generation = this.assetGeneration;
    const pending = Promise.all([
      loadExtensionStyle('options/stitch/styles/stitch.css'),
      loadExtensionStyle('options/stitch/styles/variants/stitch-secondary.css')
    ])
      .then(([stitchCss, stitchSecondaryCss]) => {
        if (generation !== this.assetGeneration) {
          return false;
        }
        this.stitchStyles = stitchCss;
        this.stitchSecondaryStyles = stitchSecondaryCss;
        if (supportsAdoptedStyleSheets()) {
          this.stitchSheet = createManagedStyleSheet(stitchCss);
          this.stitchSecondarySheet = createManagedStyleSheet(stitchSecondaryCss);
        } else {
          this.stitchSheet = null;
          this.stitchSecondarySheet = null;
        }
        return true;
      })
      .catch((error) => {
        if (generation === this.assetGeneration) {
          console.warn('[PanelStyleSheetManager] Failed to load stitch styles:', error);
          this.stitchSheet = null;
          this.stitchSecondarySheet = null;
          this.stitchStyles = null;
          this.stitchSecondaryStyles = null;
        }
        return false;
      })
      .finally(() => {
        if (this.stitchPendingLoad === pending) {
          this.stitchPendingLoad = null;
        }
      });
    this.stitchPendingLoad = pending;
    return pending;
  }
}

export const panelStyleSheetManager = PanelStyleSheetManager.getInstance();
