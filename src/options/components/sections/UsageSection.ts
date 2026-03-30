import type { UsageStats } from '@shared/types/usage';
import {
  DEFAULT_USAGE_STATS,
  normalizeUsageStats,
  USAGE_STATS_STORAGE_KEY
} from '@shared/constants';
import type { CompleteOptions } from '@shared/types/options';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { getService } from '@shared/di';
import { DI_TOKENS } from '@shared/di/tokens';
import type { StorageService } from '@platform/interfaces/storage';
import type { PlatformServices } from '@platform/types';
import { TOKENS } from '@shared/di/tokens';
import { UiButton as DaisyButton } from '../../../ui/primitives/button';
import { BaseSection, type SectionRenderContext } from './BaseSection';
import {
  buildSmoothPath,
  computeChartGeometry,
  formatDateLabel,
  pickLabelIndices,
  prepareHistory,
  type ChartGeometry
} from './usageDashboard.utils';

const SVG_NS = 'http://www.w3.org/2000/svg';
const X_AXIS_LABEL_OFFSET = 12;
const LEGACY_USAGE_STATS_STORAGE_KEY = 'usage_stats';

const isSVGSVGElement = (node: Element): node is SVGSVGElement => node instanceof SVGSVGElement;
const isSVGGElement = (node: Element): node is SVGGElement => node instanceof SVGGElement;
const isSVGPathElement = (node: Element): node is SVGPathElement => node instanceof SVGPathElement;

function createSvgElement<T extends Element>(
  tagName: string,
  guard: (node: Element) => node is T,
  label: string
): T {
  const element = document.createElementNS(SVG_NS, tagName);
  if (!guard(element)) {
    throw new Error(`[UsageSection] Failed to create ${label} element for <${tagName}>`);
  }
  return element;
}

interface UsageDomRefs {
  totalValue: HTMLElement | null;
  aiValue: HTMLElement | null;
  fragmentValue: HTMLElement | null;
  articleValue: HTMLElement | null;
}

interface ChartElements {
  axis: HTMLElement | null;
  graph: HTMLElement | null;
  svg: SVGSVGElement | null;
  path: SVGPathElement | null;
  grid: SVGGElement | null;
  points: SVGGElement | null;
  xAxis: SVGGElement | null;
}

interface UsageSnapshot {
  aiChat: number;
  fragment: number;
  article: number;
}

declare global {
  interface Window {
    aiobUsageStats?: UsageStats & { total?: number };
  }
}

export class UsageSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private readonly messagingRepo: IMessagingRepository;
  private readonly storage: StorageService;
  private unsubscribeRepo: (() => void) | null = null;
  private unsubscribeLocalUsage: (() => void) | null = null;
  private latestOptions: CompleteOptions | null = null;
  private elements: UsageDomRefs = {
    totalValue: null,
    aiValue: null,
    fragmentValue: null,
    articleValue: null
  };
  private chart: ChartElements = {
    axis: null,
    graph: null,
    svg: null,
    path: null,
    grid: null,
    points: null,
    xAxis: null
  };
  private lastSnapshot: UsageSnapshot | null = null;
  private currentStats: UsageStats | null = null;
  private resetButton: HTMLButtonElement | null = null;

  constructor(
    container: HTMLElement,
    optionsRepo: IOptionsRepository,
    messagingRepo: IMessagingRepository,
    storage: StorageService
  ) {
    super(container);
    this.optionsRepo = optionsRepo;
    this.messagingRepo = messagingRepo;
    this.storage = storage;
  }

  protected renderWithState(): HTMLElement {
    this.applySectionChrome();

    const header = this.buildHeader();
    const body = this.buildBody();
    this.container.replaceChildren(header, body);
    this.subscribeToRepository();
    return this.container;
  }

  destroy(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    this.unsubscribeLocalUsage?.();
    this.unsubscribeLocalUsage = null;
    super.destroy();
  }

  private buildHeader(): HTMLElement {
    return this.buildSectionHeader({
      title: this.messages?.usageDashboardTitle ?? 'Usage overview',
      description: this.messages?.usageDashboardSubtitle ?? 'Track how features are used over time.'
    });
  }

  private buildBody(): HTMLElement {
    const usage = this.createElement('div', 'p-4 grid gap-4', {
      id: 'usageDashboard',
      'aria-live': 'polite'
    });
    usage.append(this.buildCards(), this.buildChart(), this.buildActionRow());
    return usage;
  }

  private buildCards(): HTMLElement {
    // ✅ Phase 2 DaisyUI migration: 使用 .stats 容器
    const stats = this.createElement(
      'div',
      'stats shadow w-full grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))]'
    );

    const total = this.buildMetricCard({
      id: 'usageTotalCount',
      labelText: this.messages?.usageTotalLabel ?? 'Total saved'
    });
    this.elements.totalValue = total.value;
    stats.append(total.card);

    const ai = this.buildMetricCard({
      id: 'usageAiCount',
      labelText: this.messages?.usageAiLabel ?? 'AI conversations'
    });
    this.elements.aiValue = ai.value;
    stats.append(ai.card);

    const fragment = this.buildMetricCard({
      id: 'usageFragmentCount',
      labelText: this.messages?.usageFragmentLabel ?? 'Reading + Video + Fragment'
    });
    this.elements.fragmentValue = fragment.value;
    stats.append(fragment.card);

    const article = this.buildMetricCard({
      id: 'usageArticleCount',
      labelText: this.messages?.usageArticleLabel ?? 'Articles'
    });
    this.elements.articleValue = article.value;
    stats.append(article.card);

    return stats;
  }

  private buildMetricCard(config: { id: string; labelText: string }) {
    // ✅ Phase 2 DaisyUI migration: 使用 .stat 组件
    const stat = this.createElement('div', 'stat');

    const statTitle = this.createElement('div', 'stat-title');
    statTitle.textContent = config.labelText;

    const statValue = this.createElement('div', 'stat-value text-2xl', { id: config.id });
    statValue.textContent = '0';

    stat.append(statTitle, statValue);
    return { card: stat, value: statValue };
  }

  private buildChart(): HTMLElement {
    // ⚠️ Stage 3 Month 3: Replace custom SVG chart shell with DaisyCard host + Zag.js chart wrapper
    const chart = this.createElement(
      'div',
      [
        'relative',
        'w-full',
        'h-[200px]',
        'mt-4',
        'bg-base-100',
        'border',
        'border-base-300/50',
        'rounded-lg',
        'overflow-hidden'
      ].join(' ')
    );

    const axis = this.createElement(
      'div',
      [
        'absolute',
        'inset-0',
        'pointer-events-none',
        'opacity-0',
        'transition-opacity',
        'duration-200'
      ].join(' '),
      { id: 'usageAxis' }
    );
    chart.append(axis);

    const graph = this.createElement('div', 'absolute inset-0');
    const svg = createSvgElement('svg', isSVGSVGElement, 'root SVG');
    svg.setAttribute('id', 'usageWave');
    svg.setAttribute('viewBox', '0 0 200 160');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.classList.add('w-full', 'h-full');

    const grid = createSvgElement('g', isSVGGElement, 'grid');
    grid.setAttribute('id', 'usageGrid');

    const path = createSvgElement('path', isSVGPathElement, 'wave path');
    path.setAttribute('id', 'usageWavePath');
    path.setAttribute('d', 'M0 150 L200 150');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    path.classList.add('fill-none', 'stroke-accent', 'stroke-2');

    const points = createSvgElement('g', isSVGGElement, 'points layer');
    points.setAttribute('id', 'usagePoints');

    const xAxis = createSvgElement('g', isSVGGElement, 'x-axis layer');
    xAxis.setAttribute('id', 'usageXAxis');

    svg.append(grid, path, points, xAxis);
    graph.append(svg);
    chart.append(graph);

    this.chart = {
      axis,
      graph,
      svg,
      path,
      grid,
      points,
      xAxis
    };

    return chart;
  }

  private buildActionRow(): HTMLElement {
    const row = this.createElement(
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
    const resetHost = this.createElement('div');
    // ✅ Stage 3 Week 4: Migrated usage clear button to DaisyButton (UsageSection)
    const resetButton = new DaisyButton(resetHost).render({
      label: '清除使用数据',
      variant: 'secondary',
      size: 'sm',
      iconName: 'Trash2',
      onClick: () => {
        void this.handleClearUsage();
      }
    });
    resetButton.dataset.role = 'usage-clear';
    this.resetButton = resetButton;
    row.append(resetHost);
    return row;
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeLocalUsage?.();

    this.unsubscribeRepo = this.optionsRepo.onChange((options) => {
      this.latestOptions = options;
      void this.refreshUsageStats();
    });

    this.unsubscribeLocalUsage = this.subscribeToLocalUsage();
    void this.refreshUsageStats();
  }

  private subscribeToLocalUsage(): () => void {
    const stopCurrent = this.storage.local.watchKey<UsageStats>(
      USAGE_STATS_STORAGE_KEY,
      (value) => {
        this.handleLocalUsageChange(value);
      }
    );
    const stopLegacy = this.storage.local.watchKey<UsageStats>(
      LEGACY_USAGE_STATS_STORAGE_KEY,
      (value) => {
        this.handleLocalUsageChange(value);
      }
    );

    return () => {
      stopCurrent();
      stopLegacy();
    };
  }

  private handleLocalUsageChange(value: UsageStats | undefined): void {
    if (value) {
      this.applyUsage(normalizeUsageStats(value));
      return;
    }
    void this.refreshUsageStats();
  }

  private async refreshUsageStats(): Promise<void> {
    const stats = await this.resolveUsageStats(this.latestOptions);
    this.applyUsage(stats);
  }

  private async resolveUsageStats(options: CompleteOptions | null): Promise<UsageStats> {
    const localStats = await this.readUsageStatsFromLocal();
    if (localStats) {
      return localStats;
    }
    return this.resolveUsageStatsFromOptions(options);
  }

  private resolveUsageStatsFromOptions(options: CompleteOptions | null): UsageStats {
    const snapshot = (options as (CompleteOptions & { usageStats?: unknown }) | null)?.usageStats;
    if (!snapshot) {
      return this.cloneDefaultUsageStats();
    }
    return normalizeUsageStats(snapshot);
  }

  private async readUsageStatsFromLocal(): Promise<UsageStats | null> {
    try {
      const stored = await this.storage.local.get<UsageStats>(USAGE_STATS_STORAGE_KEY);
      if (stored) {
        return normalizeUsageStats(stored);
      }

      const legacyStored = await this.storage.local.get<UsageStats>(LEGACY_USAGE_STATS_STORAGE_KEY);
      return legacyStored ? normalizeUsageStats(legacyStored) : null;
    } catch (error) {
      console.debug('[UsageSection] Failed to read usage stats from local storage:', error);
      return null;
    }
  }

  private cloneDefaultUsageStats(): UsageStats {
    return {
      aiChatSaves: DEFAULT_USAGE_STATS.aiChatSaves,
      fragmentSaves: DEFAULT_USAGE_STATS.fragmentSaves,
      articleSaves: DEFAULT_USAGE_STATS.articleSaves,
      lastUpdatedISO: DEFAULT_USAGE_STATS.lastUpdatedISO ?? null,
      history: [...DEFAULT_USAGE_STATS.history]
    };
  }

  private applyUsage(stats: UsageStats): void {
    this.currentStats = stats;
    const total = stats.aiChatSaves + stats.fragmentSaves + stats.articleSaves;
    this.setValue(this.elements.totalValue, total.toString());
    this.setValue(this.elements.aiValue, stats.aiChatSaves.toString());
    this.setValue(this.elements.fragmentValue, stats.fragmentSaves.toString());
    this.setValue(this.elements.articleValue, stats.articleSaves.toString());

    const history = prepareHistory(stats);
    const geometry = this.updateWave(history);
    this.updateAxis(history, geometry);
    this.updateXAxis(history, geometry);
    this.updatePoints(history, geometry);
    this.emitUsageEvent(stats, total);
    this.reportUsageIncrements(stats);
  }

  private updateWave(history: UsageStats['history']): ChartGeometry {
    const measurements = measureChartBounds(this.chart.graph, this.chart.svg);
    const geometry = computeChartGeometry(history, measurements);
    if (this.chart.svg) {
      this.chart.svg.setAttribute(
        'viewBox',
        `0 0 ${geometry.svgWidth.toFixed(2)} ${geometry.svgHeight.toFixed(2)}`
      );
      this.chart.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }

    if (!this.chart.path) {
      return geometry;
    }

    if (!geometry.points.length) {
      this.chart.path.setAttribute(
        'd',
        `M0 ${geometry.baseline} L${geometry.svgWidth} ${geometry.baseline}`
      );
      this.updateGridLines([], geometry);
      return geometry;
    }

    if (geometry.points.length === 1) {
      const point = geometry.points[0];
      const startX = geometry.xPadding;
      const endX = geometry.svgWidth - geometry.xPadding;
      this.chart.path.setAttribute(
        'd',
        `M${startX.toFixed(2)} ${point.y.toFixed(2)} L${endX.toFixed(2)} ${point.y.toFixed(2)}`
      );
    } else {
      this.chart.path.setAttribute('d', buildSmoothPath(geometry.points));
    }

    const tickContexts = geometry.tickInfo.ticks.map((value) => ({
      value,
      topValue: geometry.tickInfo.topValue
    }));
    this.updateGridLines(tickContexts, geometry);
    return geometry;
  }

  private updateGridLines(
    ticks: Array<{ value: number; topValue: number }>,
    geometry: ChartGeometry
  ): void {
    if (!this.chart.grid) {
      return;
    }
    this.chart.grid.innerHTML = '';
    if (!ticks.length || geometry.usableHeight <= 0) {
      return;
    }

    ticks.forEach(({ value, topValue }) => {
      if (topValue <= 0) {
        return;
      }
      const ratio = value / topValue;
      const y = geometry.baseline - ratio * geometry.usableHeight;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('x2', geometry.svgWidth.toString());
      line.setAttribute('y1', y.toFixed(2));
      line.setAttribute('y2', y.toFixed(2));
      line.classList.add('stroke-border/40', 'stroke-[1px]');
      this.chart.grid?.appendChild(line);
    });
  }

  private updateAxis(history: UsageStats['history'], geometry: ChartGeometry): void {
    if (!this.chart.axis) {
      return;
    }
    this.chart.axis.innerHTML = '';

    if (!geometry.tickInfo.ticks.length || geometry.tickInfo.topValue === 0) {
      this.chart.axis.classList.add('opacity-0');
      return;
    }

    this.chart.axis.classList.remove('opacity-0');
    geometry.tickInfo.ticks.forEach((value) => {
      const tick = document.createElement('div');
      tick.className = 'absolute left-2 text-xs text-base-content/60/50 transform -translate-y-1/2';
      tick.textContent = value.toString();
      this.chart.axis?.appendChild(tick);
    });
  }

  private updateXAxis(history: UsageStats['history'], geometry: ChartGeometry): void {
    if (!this.chart.xAxis) {
      return;
    }
    this.chart.xAxis.innerHTML = '';
    if (!geometry.points.length) {
      return;
    }

    const baseline = geometry.baseline;
    const indices = pickLabelIndices(geometry.points.length, 6);

    indices.forEach((index) => {
      const point = geometry.points[index];
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', point.x.toFixed(2));
      label.setAttribute('y', (baseline + X_AXIS_LABEL_OFFSET).toFixed(2));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('class', 'fill-text-muted text-[10px]');
      label.textContent = formatDateLabel(history[index].date);
      this.chart.xAxis?.appendChild(label);

      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('x1', point.x.toFixed(2));
      tick.setAttribute('x2', point.x.toFixed(2));
      tick.setAttribute('y1', baseline.toFixed(2));
      tick.setAttribute('y2', (baseline + 4).toFixed(2));
      tick.classList.add('stroke-border/40', 'stroke-[1px]');
      this.chart.xAxis?.appendChild(tick);
    });
  }

  private updatePoints(history: UsageStats['history'], geometry: ChartGeometry): void {
    if (!this.chart.points) {
      return;
    }
    this.chart.points.innerHTML = '';
    if (!geometry.points.length) {
      return;
    }

    geometry.points.forEach((point) => {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', point.x.toFixed(2));
      circle.setAttribute('cy', point.y.toFixed(2));
      circle.setAttribute('r', '2.8');
      circle.classList.add('fill-accent', 'stroke-surface-0', 'stroke-2');
      this.chart.points?.appendChild(circle);
    });
  }

  private emitUsageEvent(stats: UsageStats, total: number): void {
    window.aiobUsageStats = { ...stats, total };
    window.dispatchEvent(new CustomEvent('aiob-usage-stats', { detail: window.aiobUsageStats }));
  }

  private reportUsageIncrements(stats: UsageStats): void {
    const snapshot: UsageSnapshot = {
      aiChat: stats.aiChatSaves,
      fragment: stats.fragmentSaves,
      article: stats.articleSaves
    };

    const previous = this.lastSnapshot;
    this.lastSnapshot = snapshot;

    if (!previous) {
      return;
    }

    const deltas: Array<{
      category: 'ai_chat' | 'fragment' | 'article';
      increment: number;
      total: number;
    }> = [
      { category: 'ai_chat', increment: snapshot.aiChat - previous.aiChat, total: snapshot.aiChat },
      {
        category: 'fragment',
        increment: snapshot.fragment - previous.fragment,
        total: snapshot.fragment
      },
      {
        category: 'article',
        increment: snapshot.article - previous.article,
        total: snapshot.article
      }
    ];

    deltas.forEach(({ category, increment, total: value }) => {
      if (increment <= 0) {
        return;
      }

      const payload = {
        type: 'track' as const,
        event: 'usage_dashboard_increment',
        params: {
          category,
          increment,
          total_after: value
        }
      };

      void this.messagingRepo.send(payload).catch((error) => {
        console.debug('[UsageSection] Failed to send usage increment event:', error);
      });
    });
  }

  private setValue(target: HTMLElement | null, value: string): void {
    if (target) {
      target.textContent = value;
    }
  }

  private async handleClearUsage(): Promise<void> {
    if (!this.resetButton || this.resetButton.disabled) {
      return;
    }
    this.resetButton.disabled = true;
    this.resetButton.setAttribute('aria-busy', 'true');
    try {
      const defaults = this.cloneDefaultUsageStats();
      await this.optionsRepo.set({ usageStats: defaults });
      await this.storage.local.set(USAGE_STATS_STORAGE_KEY, defaults);
      await this.storage.local.set(LEGACY_USAGE_STATS_STORAGE_KEY, defaults);
      await this.messagingRepo.send({
        type: 'track',
        event: 'clear_stats',
        params: { timestamp: Date.now() }
      });
    } catch (error) {
      console.error('[UsageSection] Failed to clear usage stats:', error);
    } finally {
      this.resetButton.disabled = false;
      this.resetButton.removeAttribute('aria-busy');
    }
  }
}

function measureChartBounds(
  graph: HTMLElement | null,
  svg: SVGSVGElement | null
): { width?: number; height?: number } {
  const fallbackWidth = 200;
  const fallbackHeight = 160;
  const graphBounds = graph?.getBoundingClientRect();
  const containerWidth =
    graphBounds && graphBounds.width > 0 ? graphBounds.width : (graph?.clientWidth ?? 0);
  const containerHeight =
    graphBounds && graphBounds.height > 0 ? graphBounds.height : (graph?.clientHeight ?? 0);
  const svgBounds = svg?.getBoundingClientRect();
  const measuredWidth =
    containerWidth ||
    svg?.clientWidth ||
    (svgBounds && svgBounds.width > 0 ? svgBounds.width : 0) ||
    fallbackWidth;
  const measuredHeight =
    containerHeight ||
    svg?.clientHeight ||
    (svgBounds && svgBounds.height > 0 ? svgBounds.height : 0) ||
    fallbackHeight;

  return { width: measuredWidth, height: measuredHeight };
}
