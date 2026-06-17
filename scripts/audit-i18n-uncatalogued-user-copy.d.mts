export interface I18nUncataloguedUserCopyFinding {
  file: string;
  line: number;
  kind: 'english-literal' | 'translation-fallback' | 'descriptor-boundary';
  category: string;
  classification: 'unexpected' | 'allowlisted';
  literal: string;
  message: string;
}

export interface I18nUncataloguedUserCopyAllowlistRule {
  id: string;
  path: string;
  line?: number;
  pattern?: string;
  category: string;
  reason: string;
  ownerPlan: string;
  revisit: string;
  literalIncludes?: string[];
  findingKinds?: string[];
}

export interface I18nUncataloguedUserCopyResult {
  ok: boolean;
  usedProductionBuildGraph: boolean;
  findings: I18nUncataloguedUserCopyFinding[];
  unexpectedFindings: I18nUncataloguedUserCopyFinding[];
  staleAllowlistEntries: Array<{
    id: string;
    path: string;
    missingRequiredMetadata?: boolean;
    missingLocator?: boolean;
  }>;
}

export function scanI18nUncataloguedUserCopy(options: {
  root: string;
  allowlist?: { rules: I18nUncataloguedUserCopyAllowlistRule[] };
  productionGraphPath?: string;
}): Promise<I18nUncataloguedUserCopyResult>;
