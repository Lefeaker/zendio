const SHARED_ACTION_ICONS = {
  '16': 'icons/bannerlogo-16.png',
  '32': 'icons/bannerlogo-32.png',
  '48': 'icons/bannerlogo-48.png',
  '128': 'icons/bannerlogo-128.png'
};

const SHARED_ICONS = {
  ...SHARED_ACTION_ICONS,
  '256': 'icons/bannerlogo-256.png'
};

const SHARED_PERMISSIONS = [
  'activeTab',
  'scripting',
  'storage',
  'contextMenus',
  'notifications'
];

const SHARED_HOST_PERMISSIONS = [
  '<all_urls>',
  'http://127.0.0.1/*',
  'https://127.0.0.1/*'
];

const SHARED_WEB_ACCESSIBLE_RESOURCES = [
  {
    resources: [
      'icons/*',
      'styles/clipper/*',
      'onboarding/*'
    ],
    matches: [
      '<all_urls>'
    ]
  }
];

export const MANIFEST_BROWSERS = ['chrome', 'firefox'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createBaseManifest() {
  return {
    manifest_version: 3,
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    version: '0.2.0',
    default_locale: 'en',
    action: {
      default_title: 'Clip to Obsidian',
      default_icon: clone(SHARED_ACTION_ICONS)
    },
    icons: clone(SHARED_ICONS),
    permissions: [...SHARED_PERMISSIONS],
    host_permissions: [...SHARED_HOST_PERMISSIONS],
    background: {
      service_worker: 'background/index.js'
    },
    options_ui: {
      page: 'options/index.html',
      open_in_tab: true
    },
    web_accessible_resources: clone(SHARED_WEB_ACCESSIBLE_RESOURCES)
  };
}

function applyBrowserOverrides(manifest, browser) {
  if (browser === 'chrome') {
    return {
      ...manifest,
      incognito: 'spanning'
    };
  }

  if (browser === 'firefox') {
    return {
      ...manifest,
      action: {
        ...manifest.action,
        default_popup: 'popup.html'
      },
      content_scripts: [
        {
          matches: ['<all_urls>'],
          js: ['content/index.js'],
          run_at: 'document_end'
        }
      ],
      browser_specific_settings: {
        gecko: {
          id: 'allinob@aiiin.com',
          strict_min_version: '113.0'
        },
        gecko_android: {
          strict_min_version: '113.0'
        }
      }
    };
  }

  throw new Error(`Unsupported manifest browser target: ${browser}`);
}

export function createBrowserManifest(browser) {
  return applyBrowserOverrides(createBaseManifest(), browser);
}
