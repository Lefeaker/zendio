const ZENDIO_OFFICIAL_WEBSITE_URLS = {
  chinese: 'https://zendio.sxnian.com/',
  default: 'https://zendio.sxnian.com/en/'
};

export function resolveZendioOfficialWebsiteUrl(language: string | null | undefined): string {
  const normalized = language?.toLowerCase();
  return normalized === 'zh-cn' || normalized === 'zh-tw'
    ? ZENDIO_OFFICIAL_WEBSITE_URLS.chinese
    : ZENDIO_OFFICIAL_WEBSITE_URLS.default;
}
