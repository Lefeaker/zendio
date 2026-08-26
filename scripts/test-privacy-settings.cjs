#!/usr/bin/env node
// @ts-check

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = 'tools/ui-production-ownership.json';

function read(relativePath, findings) {
  const fullPath = path.join(ROOT, relativePath);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    findings.push(`missing required file: ${relativePath}`);
    return '';
  }
}

function requireSnippets(source, relativePath, snippets, findings) {
  for (const snippet of snippets) {
    if (!source.includes(snippet)) {
      findings.push(`${relativePath} missing production contract: ${snippet}`);
    }
  }
}

function validateOwnershipState(manifest, { finalBoundaryReady = false } = {}) {
  const findings = [];
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    !Array.isArray(manifest.rows)
  ) {
    return ['ownership manifest has an invalid shape'];
  }
  const deferred = manifest.rows.filter((row) => row?.disposition === 'deferred-state-convergence');
  if (manifest.closureState === 'intermediate') {
    if (deferred.length !== 2) {
      findings.push(
        `intermediate ownership must contain exactly two deferred rows; found ${deferred.length}`
      );
    }
    if (deferred.some((row) => row?.replacement?.milestone !== 'U02C4')) {
      findings.push('every intermediate deferred row must name U02C4 as its replacement milestone');
    }
    return findings;
  }
  if (manifest.closureState === 'final') {
    if (deferred.length !== 0) {
      findings.push(`final ownership must contain zero deferred rows; found ${deferred.length}`);
    }
    if (
      manifest.rows.some(
        (row) =>
          row?.disposition !== 'production-runtime' && row?.disposition !== 'production-compile'
      )
    ) {
      findings.push('final ownership contains a non-production disposition');
    }
    if (!finalBoundaryReady) {
      findings.push('final ownership requires the schema-derived repository action boundary');
    }
    return findings;
  }
  return [`ownership manifest has an invalid closureState: ${String(manifest.closureState)}`];
}

function hasSchemaDerivedRepositoryBoundary(actionSource, repositorySource) {
  return (
    actionSource.includes("from '@shared/types/options'") &&
    actionSource.includes('PrivacyPreferencesOptions') &&
    actionSource.includes("Pick<IOptionsRepository, 'patch'>") &&
    actionSource.includes('optionsRepository.patch([') &&
    repositorySource.includes('export interface IOptionsRepository') &&
    repositorySource.includes('patch: (patches: OptionsPatch | readonly OptionsPatch[])')
  );
}

function validateProductionPrivacyContract() {
  const findings = [];
  const overviewPath = 'src/options/stitch/schema/settings/overview.ts';
  const schemaPath = 'src/shared/schemas/options.schema.ts';
  const sharedTypesPath = 'src/shared/types/options.ts';
  const actionPath = 'src/options/app/actions/privacyConsentAction.ts';
  const persistencePath = 'src/options/app/productionStitchPersistence.ts';
  const repositoryPath = 'src/shared/repositories/IOptionsRepository.ts';
  const onboardingPath = 'src/onboarding/bootstrap.ts';
  const onboardingDependenciesPath = 'src/onboarding/dependencies.ts';

  const overview = read(overviewPath, findings);
  requireSnippets(
    overview,
    overviewPath,
    [
      "bind: 'privacyAnalytics'",
      "bind: 'privacyErrorReporting'",
      "bind: 'privacyDebugMode'",
      "id: 'overview:updatePrivacyConsent'",
      "action: { id: 'overview:clearAnalyticsData' }",
      "action: { id: 'resource:open', args: ['privacy-policy'] }",
      "action: { id: 'resource:open', args: ['data-usage'] }"
    ],
    findings
  );

  const schema = read(schemaPath, findings);
  requireSnippets(
    schema,
    schemaPath,
    [
      'export const PrivacyPreferencesOptionsSchema = z.strictObject({',
      'analytics: z.boolean()',
      'errorReporting: z.boolean()',
      'debugMode: z.boolean()',
      'privacyPreferences: PrivacyPreferencesOptionsSchema'
    ],
    findings
  );

  const sharedTypes = read(sharedTypesPath, findings);
  requireSnippets(
    sharedTypes,
    sharedTypesPath,
    ["export type PrivacyPreferencesOptions = CompleteOptions['privacyPreferences'];"],
    findings
  );

  const action = read(actionPath, findings);
  requireSnippets(
    action,
    actionPath,
    [
      'persistPrivacyConsentAction',
      "{ path: ['privacyPreferences', 'analytics']",
      "{ path: ['privacyPreferences', 'errorReporting']",
      "{ path: ['privacyPreferences', 'debugMode']"
    ],
    findings
  );

  const persistence = read(persistencePath, findings);
  requireSnippets(
    persistence,
    persistencePath,
    [
      'persistPrivacyConsentAction',
      'setAnalyticsConsent',
      'updateErrorAnalyticsConfig',
      "createAnalyticsEventMessage('privacy_consent_changed'",
      'prepareAnalyticsDataClearedEvent',
      'clearAnalyticsPrivacyData'
    ],
    findings
  );

  const onboarding = read(onboardingPath, findings);
  requireSnippets(
    onboarding,
    onboardingPath,
    [
      "path: ['privacyPreferences', 'analytics']",
      "path: ['privacyPreferences', 'errorReporting']",
      "path: ['privacyPreferences', 'debugMode']",
      'setAnalyticsConsent',
      'updateErrorAnalyticsConfig'
    ],
    findings
  );
  const onboardingDependencies = read(onboardingDependenciesPath, findings);
  requireSnippets(
    onboardingDependencies,
    onboardingDependenciesPath,
    ['PrivacyPreferencesOptions', "patch: IOptionsRepository['patch']"],
    findings
  );

  const repository = read(repositoryPath, findings);
  const finalBoundaryReady = hasSchemaDerivedRepositoryBoundary(action, repository);
  const manifestSource = read(MANIFEST_PATH, findings);
  if (manifestSource) {
    try {
      findings.push(...validateOwnershipState(JSON.parse(manifestSource), { finalBoundaryReady }));
    } catch {
      findings.push(`${MANIFEST_PATH} is not valid JSON`);
    }
  }

  const generatedMessagesPath = 'src/i18n/generated/messages.generated.ts';
  const requiredMessages = [
    'privacySettingsTitle',
    'privacySettingsDescription',
    'privacySettingsNote',
    'privacyFooterText',
    'privacyPolicyLink',
    'privacySettingsSaved',
    'privacyDataWillBeCleared'
  ];
  requireSnippets(
    read(generatedMessagesPath, findings),
    generatedMessagesPath,
    requiredMessages,
    findings
  );
  for (const locale of ['zh-CN', 'en', 'ja']) {
    const localePath = `src/i18n/catalog/messages/${locale}/runtime.json`;
    requireSnippets(read(localePath, findings), localePath, requiredMessages, findings);
  }

  return { findings, finalBoundaryReady };
}

function validateModeFixtures() {
  const boundary = true;
  const intermediate = validateOwnershipState({
    closureState: 'intermediate',
    rows: [
      {
        path: 'src/ui/temporary/contract-a.ts',
        disposition: 'deferred-state-convergence',
        replacement: { owner: 'src/shared/current.ts', milestone: 'U02C4' }
      },
      {
        path: 'src/ui/temporary/contract-b.ts',
        disposition: 'deferred-state-convergence',
        replacement: { owner: 'src/shared/current.ts', milestone: 'U02C4' }
      }
    ]
  });
  const final = validateOwnershipState(
    {
      closureState: 'final',
      rows: [
        {
          path: 'src/ui/current/runtime.ts',
          disposition: 'production-runtime',
          replacement: { owner: 'src/ui/current/runtime.ts', milestone: 'current-production' }
        }
      ]
    },
    { finalBoundaryReady: boundary }
  );
  return [...intermediate, ...final];
}

function main() {
  const { findings, finalBoundaryReady } = validateProductionPrivacyContract();
  findings.push(...validateModeFixtures());
  if (findings.length > 0) {
    console.error('Privacy settings production contract failed:\n');
    findings.forEach((finding) => console.error(`- ${finding}`));
    process.exitCode = 1;
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST_PATH), 'utf8'));
  const deferred = manifest.rows.filter(
    (row) => row.disposition === 'deferred-state-convergence'
  ).length;
  console.log(
    `Privacy settings production contract passed: mode=${manifest.closureState}, deferred=${deferred}, schemaRepositoryBoundary=${finalBoundaryReady}.`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  hasSchemaDerivedRepositoryBoundary,
  validateModeFixtures,
  validateOwnershipState,
  validateProductionPrivacyContract
};
