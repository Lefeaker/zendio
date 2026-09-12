import { loadExtensionStyle, type ContentStylePack } from '../../clipper/shared/styleRegistry';
import {
  createManagedStyleSheet,
  ManagedShadowStyleHost,
  supportsAdoptedStyleSheets,
  type ManagedStyleEntry,
  type StyleAttachmentHandle
} from '@ui/foundation/style-host';

type PanelStylePack = Exclude<ContentStylePack, 'clipper'>;
type PackState = {
  cssText: string | null;
  sheet: CSSStyleSheet | null;
  pending: Promise<readonly ManagedStyleEntry[]> | null;
};

export function prepareStyleHost(host: HTMLElement): void {
  host.hidden = true;
  host.setAttribute('aria-busy', 'true');
}

export async function revealStyleHost(
  host: HTMLElement,
  attachment: StyleAttachmentHandle
): Promise<boolean> {
  const result = await attachment.ready;
  if (result.status !== 'ready') return false;
  host.removeAttribute('aria-busy');
  if (host.dataset.aiobStyleReveal === 'true') host.hidden = false;
  return true;
}

class PanelStyleSheetManager {
  private static instance: PanelStyleSheetManager | null = null;
  private readonly styleHost = new ManagedShadowStyleHost();
  private readonly states = new Map<PanelStylePack, PackState>();
  private assetGeneration = 0;

  static getInstance(): PanelStyleSheetManager {
    if (!PanelStyleSheetManager.instance) {
      PanelStyleSheetManager.instance = new PanelStyleSheetManager();
    }
    return PanelStyleSheetManager.instance;
  }

  applyReaderStyles(root: ShadowRoot): StyleAttachmentHandle {
    return this.attach(root, 'reader');
  }

  applyVideoStyles(root: ShadowRoot): StyleAttachmentHandle {
    return this.attach(root, 'video');
  }

  applyPromptTaskStyles(root: ShadowRoot): StyleAttachmentHandle {
    return this.attach(root, 'prompt-task');
  }

  destroy(): void {
    this.styleHost.destroy();
    this.assetGeneration += 1;
    this.states.clear();
  }

  getRegistrationCount(): number {
    return this.styleHost.getRegistrationCount();
  }

  private attach(root: ShadowRoot, pack: PanelStylePack): StyleAttachmentHandle {
    return this.styleHost.attach(root, () => this.getEntries(pack));
  }

  private getEntries(pack: PanelStylePack): Promise<readonly ManagedStyleEntry[]> {
    const state = this.state(pack);
    if (state.cssText !== null) return Promise.resolve(this.loadedEntries(pack, state));
    if (state.pending) return state.pending;

    const generation = this.assetGeneration;
    const pending = loadExtensionStyle(`ui/stitch-runtime/styles/${pack}.css`)
      .then((cssText) => {
        if (generation !== this.assetGeneration) {
          throw new Error(`${pack} style load was superseded`);
        }
        state.cssText = cssText;
        state.sheet = supportsAdoptedStyleSheets() ? createManagedStyleSheet(cssText) : null;
        return this.loadedEntries(pack, state);
      })
      .finally(() => {
        if (state.pending === pending) state.pending = null;
      });
    state.pending = pending;
    return pending;
  }

  private state(pack: PanelStylePack): PackState {
    const existing = this.states.get(pack);
    if (existing) return existing;
    const created: PackState = { cssText: null, sheet: null, pending: null };
    this.states.set(pack, created);
    return created;
  }

  private loadedEntries(pack: PanelStylePack, state: PackState): readonly ManagedStyleEntry[] {
    return [{ key: `panel-${pack}-style-pack`, cssText: state.cssText ?? '', sheet: state.sheet }];
  }
}

export const panelStyleSheetManager = PanelStyleSheetManager.getInstance();
