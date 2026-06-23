import { createReleaseLanguageOptions } from '../languageOptions';
import { message, previewNavigation } from '../previewNavigation';
import type { PreviewContent } from '../types';

const SAMPLE_USAGE_TOTAL_LABEL = message('schemaPreviewUsageTotalLabel');

const usageHistoryValues = [
  24, 28, 31, 36, 33, 39, 44, 41, 48, 53, 58, 55, 62, 67, 61, 57, 52, 49, 54, 60, 66, 72, 78, 74,
  69, 64, 70, 76, 82, 79
];

const usageHistory = usageHistoryValues.map((value, index) => {
  const day = index + 23;
  const month = day <= 31 ? '03' : '04';
  const date = day <= 31 ? day : day - 31;
  return {
    label: `${month}-${String(date).padStart(2, '0')}`,
    value
  };
});

export const previewBrand: PreviewContent['brand'] = {
  title: 'Zendio',
  subtitle: previewNavigation.brandSubtitle,
  logo: '../../AiiinOB/public/icons/bannerlogo-128.png'
};

export const previewRendererLabels: PreviewContent['rendererLabels'] = {
  resourcePendingBadge: 'Pending',
  resourceOpenAction: 'Open',
  highlightExamplePrefix: 'An exported example will look like ',
  highlightExampleText: 'this highlighted section',
  highlightExampleSuffix: ', making it easier to revisit later.'
};

export const previewSidebarLinks: PreviewContent['sidebarLinks'] = previewNavigation.sidebarLinks;
export const previewSurfaceLinks: PreviewContent['surfaceLinks'] = previewNavigation.surfaceLinks;
export const previewNav: PreviewContent['nav'] = previewNavigation.nav;

export const overviewContent: PreviewContent['overview'] = {
  hero: {
    title: 'Overview',
    description: message('schemaOverviewHeroDescription'),
    pills: ['Default vault ready', 'Routing active', 'YAML configured'],
    icon: 'dashboard'
  },
  stats: [
    { label: SAMPLE_USAGE_TOTAL_LABEL, value: 1284 },
    { label: message('usageAiLabel'), value: 436 },
    { label: message('usageFragmentLabel'), value: 406 },
    { label: 'Articles', value: 442 }
  ],
  history: usageHistory
};

export const previewLanguageOptions: PreviewContent['languageOptions'] =
  createReleaseLanguageOptions();

export const privacyCollectedContent: PreviewContent['privacyCollected'] = [
  'Error type and call site',
  'Browser / extension version',
  'Failure timestamp',
  'Anonymous feature usage counts'
];

export const privacyExcludedContent: PreviewContent['privacyExcluded'] = [
  'Personal identity information',
  'Page content and clipped text',
  'Private URL lists',
  'Plaintext passwords and API keys'
];
