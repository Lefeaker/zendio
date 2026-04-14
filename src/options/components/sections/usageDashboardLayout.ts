import type { Messages } from '@i18n';
import { UiButton as DaisyButton } from '@ui/primitives/button';
import { createUsageChartShell, type ChartElements } from './usageChart';

export interface UsageDomRefs {
  totalValue: HTMLElement | null;
  aiValue: HTMLElement | null;
  fragmentValue: HTMLElement | null;
  articleValue: HTMLElement | null;
}

export interface UsageDashboardLayoutResult {
  body: HTMLElement;
  elements: UsageDomRefs;
  chart: ChartElements;
  resetButton: HTMLButtonElement;
}

export function buildUsageDashboardLayout(args: {
  createElement: <K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    className?: string,
    attributes?: Record<string, string>
  ) => HTMLElementTagNameMap[K];
  messages: Messages | null;
  onClear: () => void;
}): UsageDashboardLayoutResult {
  const { createElement, messages, onClear } = args;

  const elements: UsageDomRefs = {
    totalValue: null,
    aiValue: null,
    fragmentValue: null,
    articleValue: null
  };

  const body = createElement('div', 'p-4 grid gap-4', {
    id: 'usageDashboard',
    'aria-live': 'polite'
  });

  const stats = createElement(
    'div',
    'stats shadow w-full grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))]'
  );

  const total = buildMetricCard({
    createElement,
    id: 'usageTotalCount',
    labelText: messages?.usageTotalLabel ?? 'Total saved'
  });
  elements.totalValue = total.value;
  stats.append(total.card);

  const ai = buildMetricCard({
    createElement,
    id: 'usageAiCount',
    labelText: messages?.usageAiLabel ?? 'AI conversations'
  });
  elements.aiValue = ai.value;
  stats.append(ai.card);

  const fragment = buildMetricCard({
    createElement,
    id: 'usageFragmentCount',
    labelText: messages?.usageFragmentLabel ?? 'Reading + Video + Fragment'
  });
  elements.fragmentValue = fragment.value;
  stats.append(fragment.card);

  const article = buildMetricCard({
    createElement,
    id: 'usageArticleCount',
    labelText: messages?.usageArticleLabel ?? 'Articles'
  });
  elements.articleValue = article.value;
  stats.append(article.card);

  const { host, chart } = createUsageChartShell((tagName: string) =>
    createElement(tagName as keyof HTMLElementTagNameMap)
  );

  const actionRow = createElement(
    'div',
    [
      'flex',
      'flex-wrap',
      'gap-3',
      'items-center',
      'mt-4',
      'border-t',
      'border-base-300',
      'pt-4'
    ].join(' ')
  );
  const resetHost = createElement('div');
  const resetButton = new DaisyButton(resetHost).render({
    label: '清除使用数据',
    variant: 'secondary',
    size: 'sm',
    iconName: 'Trash2',
    onClick: onClear
  });
  resetButton.dataset.role = 'usage-clear';
  actionRow.append(resetHost);

  body.append(stats, host, actionRow);

  return {
    body,
    elements,
    chart,
    resetButton
  };
}

function buildMetricCard(args: {
  createElement: <K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    className?: string,
    attributes?: Record<string, string>
  ) => HTMLElementTagNameMap[K];
  id: string;
  labelText: string;
}): { card: HTMLElement; value: HTMLElement } {
  const { createElement, id, labelText } = args;
  const stat = createElement('div', 'stat');

  const statTitle = createElement('div', 'stat-title');
  statTitle.textContent = labelText;

  const statValue = createElement('div', 'stat-value text-2xl', { id });
  statValue.textContent = '0';

  stat.append(statTitle, statValue);
  return { card: stat, value: statValue };
}
