/**
 * Navigation Repository 接口
 * 负责处理 Onboarding/Options 等页面的跳转操作
 */
export interface INavigationRepository {
  /**
   * 打开 Obsidian Vault
   * @param url 可选的自定义 Vault 链接，默认 obsidian://open
   */
  openVault(url?: string): Promise<void>;

  /**
   * 打开插件 Options 页面
   */
  openOptions(): Promise<void>;

  /**
   * 打开任意外部链接
   */
  openExternalLink(url: string): Promise<void>;
}
