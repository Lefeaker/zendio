import { loadClipperStyle } from '../../clipper/shared/styleRegistry';
import {
  applyManagedShadowStyle,
  createManagedStyleSheet,
  supportsAdoptedStyleSheets
} from '../../../ui/foundation/style-host';

const PANEL_CLIPPER_BRIDGE_KEY = 'panel-clipper-tailwind';
const PANEL_VIDEO_BRIDGE_KEY = 'panel-video-tailwind';

class PanelStyleSheetManager {
  private static instance: PanelStyleSheetManager | null = null;
  private initialized = false;
  private pendingLoad: Promise<void> | null = null;
  private clipperSheet: CSSStyleSheet | null = null;
  private videoSheet: CSSStyleSheet | null = null;
  private clipperStyles: string | null = null;
  private videoStyles: string | null = null;
  private readonly readerRoots = new Set<ShadowRoot>();
  private readonly videoRoots = new Set<ShadowRoot>();

  static getInstance(): PanelStyleSheetManager {
    if (!PanelStyleSheetManager.instance) {
      PanelStyleSheetManager.instance = new PanelStyleSheetManager();
    }
    return PanelStyleSheetManager.instance;
  }

  initialize(): Promise<void> {
    if (this.initialized) {
      return this.pendingLoad ?? Promise.resolve();
    }

    if (this.pendingLoad !== null) {
      return this.pendingLoad;
    }

    // 延迟加载样式，避免模块顶层导入失败
    this.pendingLoad = Promise.all([
      loadClipperStyle('clipper.tailwind'),
      loadClipperStyle('video.tailwind')
    ])
      .then(([clipperCss, videoCss]) => {
        this.clipperStyles = clipperCss;
        this.videoStyles = videoCss;

        if (supportsAdoptedStyleSheets()) {
          this.clipperSheet = createManagedStyleSheet(clipperCss);
          this.videoSheet = createManagedStyleSheet(videoCss);
        } else {
          this.clipperSheet = null;
          this.videoSheet = null;
        }
        this.replayRegisteredRoots();
      })
      .catch((error) => {
        console.warn('[PanelStyleSheetManager] Failed to load styles:', error);
        this.clipperSheet = null;
        this.videoSheet = null;
        this.clipperStyles = null;
        this.videoStyles = null;
      })
      .finally(() => {
        this.initialized = true;
        this.pendingLoad = null;
      });

    return this.pendingLoad;
  }

  applyReaderStyles(shadowRoot: ShadowRoot): void {
    if (!this.initialized) {
      void this.initialize();
    }
    this.readerRoots.add(shadowRoot);
    applyManagedShadowStyle(
      shadowRoot,
      PANEL_CLIPPER_BRIDGE_KEY,
      this.clipperStyles ?? '',
      this.clipperSheet
    );
  }

  applyVideoStyles(shadowRoot: ShadowRoot): void {
    if (!this.initialized) {
      void this.initialize();
    }
    this.videoRoots.add(shadowRoot);

    applyManagedShadowStyle(
      shadowRoot,
      PANEL_CLIPPER_BRIDGE_KEY,
      this.clipperStyles ?? '',
      this.clipperSheet
    );
    applyManagedShadowStyle(
      shadowRoot,
      PANEL_VIDEO_BRIDGE_KEY,
      this.videoStyles ?? '',
      this.videoSheet
    );
  }

  destroy(): void {
    this.pendingLoad = null;
    this.clipperSheet = null;
    this.videoSheet = null;
    this.clipperStyles = null;
    this.videoStyles = null;
    this.readerRoots.clear();
    this.videoRoots.clear();
    this.initialized = false;
  }

  private replayRegisteredRoots(): void {
    this.readerRoots.forEach((root) => {
      if (!this.isRootConnected(root)) {
        this.readerRoots.delete(root);
        return;
      }
      applyManagedShadowStyle(
        root,
        PANEL_CLIPPER_BRIDGE_KEY,
        this.clipperStyles ?? '',
        this.clipperSheet
      );
    });

    this.videoRoots.forEach((root) => {
      if (!this.isRootConnected(root)) {
        this.videoRoots.delete(root);
        return;
      }
      applyManagedShadowStyle(
        root,
        PANEL_CLIPPER_BRIDGE_KEY,
        this.clipperStyles ?? '',
        this.clipperSheet
      );
      applyManagedShadowStyle(
        root,
        PANEL_VIDEO_BRIDGE_KEY,
        this.videoStyles ?? '',
        this.videoSheet
      );
    });
  }

  private isRootConnected(root: ShadowRoot): boolean {
    return Boolean(root.host?.isConnected);
  }
}

export const panelStyleSheetManager = PanelStyleSheetManager.getInstance();
