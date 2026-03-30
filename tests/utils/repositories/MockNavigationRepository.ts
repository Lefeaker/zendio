import type { INavigationRepository } from '@shared/repositories/INavigationRepository';

export class MockNavigationRepository implements INavigationRepository {
  public openedVaults: string[] = [];
  public openedExternalLinks: string[] = [];
  public optionsOpenedCount = 0;

  openVault(url?: string): Promise<void> {
    this.openedVaults.push(url ?? 'obsidian://open');
    return Promise.resolve();
  }

  openOptions(): Promise<void> {
    this.optionsOpenedCount += 1;
    return Promise.resolve();
  }

  openExternalLink(url: string): Promise<void> {
    this.openedExternalLinks.push(url);
    return Promise.resolve();
  }

  reset(): void {
    this.openedVaults = [];
    this.openedExternalLinks = [];
    this.optionsOpenedCount = 0;
  }
}
