export const OWNERSHIP_PUBLIC_EXPORTS = [
  'analyzeTestModule',
  'auditRepositoryTestSuiteOwnership',
  'buildTestSuiteOwnershipReport',
  'decodeNulDelimitedPaths',
  'formatTestSuiteOwnershipReport',
  'listGitVisibleTestFiles',
  'matchesTestPattern',
  'parsePlaywrightConfig',
  'parseVitestConfig'
];

export const OWNERSHIP_CHARACTERIZATION_SOURCES: ReadonlyArray<readonly [string, string]> = [
  [
    'tests/unit/owned.test.ts',
    "import { describe, it } from 'vitest';\nimport './support.test';\ndescribe('owned', () => it('works', () => undefined));\n"
  ],
  ['tests/unit/support.test.ts', 'export const fixtureValue = 1;\n']
];

export const OWNERSHIP_CHARACTERIZATION = {
  pass: {
    reportSha256: '1c1930fbf11f6f22fb19669e854df91beac0c6d113e7a389860fd13973c16549',
    formattedSha256: '0006d8ee023a99c5ab95cb1318eecc60a838930d7f056bb01bf0a80500d369e5',
    failures: []
  },
  zeroOwner: {
    reportSha256: '043c265196867429634228057272e271f91482da575d8239f7db751c9a867d29',
    formattedSha256: 'ba31bb9422a7a8f2f44edcbbc71dc54999f6daa4cfc619caaee94807b2776a18',
    failures: ['zero-owner:tests/unit/owned.test.ts']
  }
};
