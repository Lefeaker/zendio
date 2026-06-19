export type BrowserManifestTarget = 'chrome' | 'firefox';

export interface BrowserManifest {
  manifest_version: number;
  permissions?: string[];
  options_ui?: {
    page?: string;
    open_in_tab?: boolean;
  };
  incognito?: string;
  action?: {
    default_popup?: string;
    default_title?: string;
  };
  background?: {
    service_worker?: string;
    scripts?: string[];
  };
  browser_specific_settings?: {
    gecko?: {
      id?: string;
      strict_min_version?: string;
      data_collection_permissions?: {
        required: string[];
        optional?: string[];
      };
    };
    gecko_android?: {
      strict_min_version?: string;
    };
  };
  content_scripts?: Array<{
    matches: string[];
    js: string[];
    run_at?: string;
  }>;
}

export function createBrowserManifest(target: BrowserManifestTarget): BrowserManifest;
