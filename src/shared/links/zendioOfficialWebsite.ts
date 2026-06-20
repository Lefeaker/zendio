const ZENDIO_OFFICIAL_WEBSITE_URLS = {
  chinese: 'https://sxnian.com/projects/zendio/',
  default: 'https://sxnian.com/projects/zendio/en/'
};

export function resolveZendioOfficialWebsiteUrl(language: string | null | undefined): string {
  const normalized = language?.toLowerCase();
  return normalized === 'zh-cn' || normalized === 'zh-tw'
    ? ZENDIO_OFFICIAL_WEBSITE_URLS.chinese
    : ZENDIO_OFFICIAL_WEBSITE_URLS.default;
}
