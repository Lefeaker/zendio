import type { TabsService } from '../../platform/interfaces/tabs';
import type { RuntimeService } from '../../platform/interfaces/runtime';
import { chromeTabsService } from '../../platform/chrome/tabs';
import { chromeRuntimeService } from '../../platform/chrome/runtime';
import type { INavigationRepository } from '../../shared/repositories/INavigationRepository';

/**
 * Chrome 环境下的导航仓库实现
 */
export class ChromeNavigationRepository implements INavigationRepository {
  constructor(
    private readonly tabs: TabsService = chromeTabsService,
    private readonly runtime: RuntimeService = chromeRuntimeService
  ) {}

  async openVault(url?: string): Promise<void> {
    await this.tabs.create({ url: url ?? 'obsidian://open' });
  }

  async openOptions(): Promise<void> {
    await this.runtime.openOptionsPage();
  }

  async openExternalLink(url: string): Promise<void> {
    await this.tabs.create({ url });
  }
}
