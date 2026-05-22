import type { UsageStats } from '@shared/types/usage';
import { normalizeUsageStats, USAGE_STATS_STORAGE_KEY } from '@shared/constants';
import type { CompleteOptions } from '@shared/types/options';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { StorageService } from '@platform/interfaces/storage';
import { renderUsageChart, type ChartElements } from '@ui/domains/usage-chart';
import { BaseSection, type SectionRenderContext } from './BaseSection';
import {
  buildUsageDashboardLayout,
  buildUsageSnapshot,
  cloneDefaultUsageStats,
  emitUsageStatsWindowEvent,
  reportUsageIncrementChanges,
  type UsageDomRefs,
  type UsageSnapshot
} from '@options/app/usage-dashboard';
import { resetUsageStatsAction } from '../../app/actions';
import { resolveUsageStatsSnapshot, subscribeToUsageStorage } from './usageDashboardData';

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
    const layout = buildUsageDashboardLayout({
      createElement: (tagName, className, attributes) =>
        this.createElement(tagName, className, attributes),
      messages: this.messages,
      onClear: () => {
        void this.handleClearUsage();
      }
    });
    this.elements = layout.elements;
    this.chart = layout.chart;
    this.resetButton = layout.resetButton;
    return layout.body;
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeLocalUsage?.();

    this.unsubscribeRepo = this.optionsRepo.onChange((options) => {
      this.latestOptions = options;
      void this.refreshUsageStats();
    });

    this.unsubscribeLocalUsage = subscribeToUsageStorage(this.storage, (value) => {
      this.handleLocalUsageChange(value);
    });
    void this.refreshUsageStats();
  }

  private handleLocalUsageChange(value: UsageStats | undefined): void {
    if (value) {
      this.applyUsage(normalizeUsageStats(value));
      return;
    }
    void this.refreshUsageStats();
  }

  private async refreshUsageStats(): Promise<void> {
    const stats = await resolveUsageStatsSnapshot(this.storage, this.latestOptions);
    this.applyUsage(stats);
  }

  private applyUsage(stats: UsageStats): void {
    const total = stats.aiChatSaves + stats.fragmentSaves + stats.articleSaves;
    this.setValue(this.elements.totalValue, total.toString());
    this.setValue(this.elements.aiValue, stats.aiChatSaves.toString());
    this.setValue(this.elements.fragmentValue, stats.fragmentSaves.toString());
    this.setValue(this.elements.articleValue, stats.articleSaves.toString());
    renderUsageChart(this.chart, stats);
    emitUsageStatsWindowEvent(stats, total);
    const current = buildUsageSnapshot(stats);
    this.lastSnapshot = reportUsageIncrementChanges({
      messagingRepo: this.messagingRepo,
      previous: this.lastSnapshot,
      current,
      onError: (error) => {
        console.debug('[UsageSection] Failed to send usage increment event:', error);
      }
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
      const defaults = cloneDefaultUsageStats();
      await resetUsageStatsAction(defaults, {
        optionsRepository: this.optionsRepo,
        storage: this.storage,
        messagingRepository: this.messagingRepo,
        storageKeys: [USAGE_STATS_STORAGE_KEY, 'usage_stats'],
        now: Date.now
      });
    } catch (error) {
      console.error('[UsageSection] Failed to clear usage stats:', error);
    } finally {
      this.resetButton.disabled = false;
      this.resetButton.removeAttribute('aria-busy');
    }
  }
}
