import type { UsageStats } from '@shared/types/usage';
import {
  normalizeUsageStats,
  USAGE_STATS_STORAGE_KEY
} from '@shared/constants';
import type { CompleteOptions } from '@shared/types/options';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { StorageService } from '@platform/interfaces/storage';
import { BaseSection, type SectionRenderContext } from './BaseSection';
import { renderUsageChart, type ChartElements } from './usageChart';
import {
  buildUsageSnapshot,
  cloneDefaultUsageStats,
  emitUsageStatsWindowEvent,
  reportUsageIncrementChanges,
  resolveUsageStatsFromOptions,
  type UsageSnapshot
} from './usageDashboardState';
import { resetUsageStatsAction } from '../../app/actions';
import { buildUsageDashboardLayout, type UsageDomRefs } from './usageDashboardLayout';
const LEGACY_USAGE_STATS_STORAGE_KEY = 'usage_stats';

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
    return resolveUsageStatsFromOptions(options);
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
    return cloneDefaultUsageStats();
  }

  private applyUsage(stats: UsageStats): void {
    this.currentStats = stats;
    const total = stats.aiChatSaves + stats.fragmentSaves + stats.articleSaves;
    this.setValue(this.elements.totalValue, total.toString());
    this.setValue(this.elements.aiValue, stats.aiChatSaves.toString());
    this.setValue(this.elements.fragmentValue, stats.fragmentSaves.toString());
    this.setValue(this.elements.articleValue, stats.articleSaves.toString());
    renderUsageChart(this.chart, stats);
    this.emitUsageEvent(stats, total);
    this.reportUsageIncrements(stats);
  }

  private emitUsageEvent(stats: UsageStats, total: number): void {
    emitUsageStatsWindowEvent(stats, total);
  }

  private reportUsageIncrements(stats: UsageStats): void {
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
      const defaults = this.cloneDefaultUsageStats();
      await resetUsageStatsAction(defaults, {
        optionsRepository: this.optionsRepo,
        storage: this.storage,
        messagingRepository: this.messagingRepo,
        storageKeys: [USAGE_STATS_STORAGE_KEY, LEGACY_USAGE_STATS_STORAGE_KEY],
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
