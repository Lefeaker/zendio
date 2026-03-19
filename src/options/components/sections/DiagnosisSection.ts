import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';
import { DaisyCard } from '../shared/DaisyCard';
import { createButton } from '../shared/DaisyUIHelpers';
import {
  runDiagnostics as runDiagnosticsAction,
  fixConfiguration as fixConfigurationAction,
  reloadDiagnostics as reloadDiagnosticsAction
} from '../../app/optionsActions';

export class DiagnosisSection extends BaseSection<SectionRenderContext> {
  private diagnoseButton: HTMLButtonElement | null = null;
  private fixButton: HTMLButtonElement | null = null;
  private reloadButton: HTMLButtonElement | null = null;

  protected renderWithState(): HTMLElement {
    this.container.classList.add('aobx-section', 'bg-base-100', 'border', 'border-base-300', 'rounded-lg', 'p-[clamp(22px,2.5vw,32px)]', 'shadow-card');
    const header = this.buildHeader();
    const body = this.buildBody();

    this.container.replaceChildren(header, body);
    return this.container;
  }

  override destroy(): void {
    this.diagnoseButton?.removeEventListener('click', this.handleDiagnose);
    this.fixButton?.removeEventListener('click', this.handleFix);
    this.reloadButton?.removeEventListener('click', this.handleReload);
    this.diagnoseButton = null;
    this.fixButton = null;
    this.reloadButton = null;
    super.destroy();
  }

  private buildHeader(): HTMLElement {
    const header = this.createElement('div', 'grid gap-2 mb-6');

    const titleWrapper = this.createElement('div', 'flex items-center gap-2');
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold text-base-content m-0';
    title.textContent = this.messages?.diagnosisTitle ?? '配置诊断';
    titleWrapper.append(title);

    const subtitle = this.createElement('div', 'text-sm text-base-content/60');
    subtitle.textContent = '点击“诊断配置”按钮后可在此查看检查结果与修复建议。';

    header.append(titleWrapper, subtitle);
    return header;
  }

  private buildBody(): HTMLElement {
    const wrapper = this.createElement('div', 'mt-6 space-y-6');

    const hint = this.createElement('div', 'w-full text-xs text-base-content/60 mt-1');
    hint.textContent =
      '诊断会检视 REST API、路径模板、域名映射、多仓路由等配置，并输出详细报告。';
    wrapper.append(hint);

    wrapper.append(this.buildActionRow());
    wrapper.append(this.buildDiagnosticOutput());

    return wrapper;
  }

  private buildActionRow(): HTMLElement {
    const actionRow = this.createElement('div', 'flex flex-wrap gap-3 items-center mt-4');

    const diagnoseButton = createButton(this.messages?.diagnoseButton ?? '🔍 诊断配置', { variant: 'primary' });
    diagnoseButton.type = 'button';
    diagnoseButton.id = 'diagBtn';
    diagnoseButton.addEventListener('click', this.handleDiagnose);

    const fixButton = createButton(this.messages?.fixButton ?? '🔧 修复配置', { variant: 'outline' });
    fixButton.type = 'button';
    fixButton.id = 'fixBtn';
    fixButton.addEventListener('click', this.handleFix);

    const reloadButton = createButton(this.messages?.reloadButton ?? '🔄 重新加载', { variant: 'outline' });
    reloadButton.type = 'button';
    reloadButton.id = 'reloadBtn';
    reloadButton.addEventListener('click', this.handleReload);

    this.diagnoseButton = diagnoseButton;
    this.fixButton = fixButton;
    this.reloadButton = reloadButton;

    actionRow.append(diagnoseButton, fixButton, reloadButton);
    return actionRow;
  }

  private buildDiagnosticOutput(): HTMLElement {
    const container = this.createElement('div', 'mt-4');
    container.id = 'diagSection';
    container.style.display = 'none';

    const titleRow = this.createElement('div', 'grid gap-2 mb-6');
    const titleWrapper = this.createElement('div', 'flex items-center gap-2');
    const title = document.createElement('h3');
    title.className = 'text-base font-semibold text-base-content m-0';
    title.textContent = '诊断结果';
    titleWrapper.append(title);
    titleRow.append(titleWrapper);
    container.append(titleRow);

    const output = document.createElement('pre');
    output.id = 'diagOutput';
    output.className = 'font-mono text-sm leading-relaxed max-h-[320px] overflow-y-auto whitespace-pre-wrap break-words bg-base-200 rounded-md p-4';
    output.setAttribute('aria-live', 'polite');

    const cardHost = this.createElement('div', 'mt-2');
    const cardBody = this.createElement('div');
    cardBody.append(output);

    const card = new DaisyCard(cardHost);
    card.render({
      body: cardBody
    });

    container.append(cardHost);

    return container;
  }

  private setLoadingState(button: HTMLButtonElement | null, loading: boolean): void {
    if (!button) {
      return;
    }
    button.disabled = loading;
    button.setAttribute('aria-busy', loading ? 'true' : 'false');
    if (!loading) {
      button.removeAttribute('aria-busy');
    }
  }

  private handleDiagnose = (): void => {
    if (!this.diagnoseButton) {
      return;
    }
    this.setLoadingState(this.diagnoseButton, true);
    void runDiagnosticsAction()
      .catch((error) => {
        console.error('[DiagnosisSection] Diagnostics run failed:', error);
      })
      .finally(() => {
        this.setLoadingState(this.diagnoseButton, false);
      });
  };

  private handleFix = (): void => {
    if (!this.fixButton) {
      return;
    }
    this.setLoadingState(this.fixButton, true);
    void fixConfigurationAction()
      .catch((error) => {
        console.error('[DiagnosisSection] Fix operation failed:', error);
      })
      .finally(() => {
        this.setLoadingState(this.fixButton, false);
      });
  };

  private handleReload = (): void => {
    if (!this.reloadButton) {
      return;
    }
    this.setLoadingState(this.reloadButton, true);
    void reloadDiagnosticsAction()
      .catch((error) => {
        console.error('[DiagnosisSection] Reload operation failed:', error);
      })
      .finally(() => {
        this.setLoadingState(this.reloadButton, false);
      });
  };
}
