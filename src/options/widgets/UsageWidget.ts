import type { StorageService } from '@platform/interfaces/storage';
import { normalizeUsageStats, USAGE_STATS_STORAGE_KEY } from '@shared/constants';
import type { UsageStats } from '@shared/types/usage';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import { resetUsageStatsAction } from '@options/app/actions';
import {
  buildUsageSnapshot,
  cloneDefaultUsageStats,
  emitUsageStatsWindowEvent,
  reportUsageIncrementChanges,
  resolveUsageStatsFromOptions,
  type UsageSnapshot
} from './shared/usage/usageDashboardState';
import { buildUsageDashboardLayout, type UsageDomRefs } from './shared/usage/usageDashboardLayout';
import { renderUsageChart, type ChartElements } from './shared/usage/usageChart';
import type { WidgetMountContract, WidgetRuntime, BaseWidgetProps } from './contracts';
import { asOptionsSnapshot, createElement } from './utils';

const LEGACY_USAGE_STATS_STORAGE_KEY = 'usage_stats';

export interface UsageWidgetDependencies {
  optionsRepository: IOptionsRepository;
  messagingRepository: IMessagingRepository;
  storage: StorageService;
}

export interface UsageWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
  trackIncrementEvents?: boolean;
}

export class UsageWidget
  implements
    WidgetMountContract<
      UsageWidgetProps,
      Partial<CompleteOptions>,
      StoredOptions | CompleteOptions | null
    >
{
  private readonly deps: UsageWidgetDependencies;
  private container: HTMLElement | null = null;
  private runtime: WidgetRuntime | undefined;
  private props: UsageWidgetProps = {};
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
  private unsubscribeRepo: (() => void) | null = null;
  private unsubscribeLocalUsage: (() => void) | null = null;
  private latestOptions: CompleteOptions | null = null;

  constructor(dependencies: UsageWidgetDependencies) {
    this.deps = dependencies;
  }

  mount(container: HTMLElement, props: UsageWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.runtime = runtime;
    this.props = props;
    this.render();
    this.subscribeToRepository();
    void this.refreshUsageStats();
    if (props.options) {
      this.applySnapshot(props.options);
    }
  }

  update(props: UsageWidgetProps, runtime?: WidgetRuntime): void {
    this.props = props;
    this.runtime = runtime ?? this.runtime;
    if (props.options) {
      this.applySnapshot(props.options);
    }
  }

  destroy(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    this.unsubscribeLocalUsage?.();
    this.unsubscribeLocalUsage = null;
    this.container = null;
    this.resetButton = null;
  }

  collect(): Partial<CompleteOptions> {
    return this.currentStats ? { usageStats: this.currentStats } : {};
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | null): void {
    const options = asOptionsSnapshot(snapshot) as CompleteOptions;
    this.latestOptions = options;
    const stats = resolveUsageStatsFromOptions(options);
    this.applyUsage(stats);
  }

  private render(): void {
    if (!this.container) {
      return;
    }

    const layout = buildUsageDashboardLayout({
      createElement,
      messages: this.props.messages ?? null,
      onClear: () => {
        void this.handleClearUsage();
      }
    });
    this.elements = layout.elements;
    this.chart = layout.chart;
    this.resetButton = layout.resetButton;
    this.container.replaceChildren(layout.body);
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeLocalUsage?.();

    this.unsubscribeRepo = this.deps.optionsRepository.onChange((options) => {
      this.latestOptions = options;
      void this.refreshUsageStats();
    });

    const stopCurrent = this.deps.storage.local.watchKey<UsageStats>(
      USAGE_STATS_STORAGE_KEY,
      (value) => this.handleLocalUsageChange(value)
    );
    const stopLegacy = this.deps.storage.local.watchKey<UsageStats>(
      LEGACY_USAGE_STATS_STORAGE_KEY,
      (value) => this.handleLocalUsageChange(value)
    );

    this.unsubscribeLocalUsage = () => {
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
      const stored = await this.deps.storage.local.get<UsageStats>(USAGE_STATS_STORAGE_KEY);
      if (stored) {
        return normalizeUsageStats(stored);
      }
      const legacyStored = await this.deps.storage.local.get<UsageStats>(
        LEGACY_USAGE_STATS_STORAGE_KEY
      );
      return legacyStored ? normalizeUsageStats(legacyStored) : null;
    } catch {
      return null;
    }
  }

  private applyUsage(stats: UsageStats): void {
    this.currentStats = stats;
    const total = stats.aiChatSaves + stats.fragmentSaves + stats.articleSaves;
    this.setValue(this.elements.totalValue, total.toString());
    this.setValue(this.elements.aiValue, stats.aiChatSaves.toString());
    this.setValue(this.elements.fragmentValue, stats.fragmentSaves.toString());
    this.setValue(this.elements.articleValue, stats.articleSaves.toString());
    renderUsageChart(this.chart, stats);
    emitUsageStatsWindowEvent(stats, total);
    this.reportUsageIncrements(stats);
  }

  private reportUsageIncrements(stats: UsageStats): void {
    if (this.props.trackIncrementEvents === false) {
      return;
    }
    const current = buildUsageSnapshot(stats);
    this.lastSnapshot = reportUsageIncrementChanges({
      messagingRepo: this.deps.messagingRepository,
      previous: this.lastSnapshot,
      current
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
        optionsRepository: this.deps.optionsRepository,
        storage: this.deps.storage,
        messagingRepository: this.deps.messagingRepository,
        storageKeys: [USAGE_STATS_STORAGE_KEY, LEGACY_USAGE_STATS_STORAGE_KEY],
        now: Date.now
      });
      this.runtime?.notifyDirty?.(['usageStats']);
    } finally {
      this.resetButton.disabled = false;
      this.resetButton.removeAttribute('aria-busy');
    }
  }
}
