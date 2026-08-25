import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createUnsignedXpi,
  lintFirefoxExtension,
  prepareFirefoxReleasePackage
} from '../../../scripts/package-firefox.mjs';

const tempRoots: string[] = [];
const RELEASE_DISPLAY_NAME = 'Zendio-All in Obsidian';
const RELEASE_ARTIFACT_BASE_NAME = `${RELEASE_DISPLAY_NAME}-v0.2.0`;

const READABILITY_WARNING_PATH = 'chunks/chunk-readability.js';
const READABILITY_WARNING_FIXTURE = [
  {
    code: 'UNSAFE_VAR_ASSIGNMENT',
    message: 'Unsafe assignment to innerHTML',
    file: READABILITY_WARNING_PATH,
    line: 2,
    column: 16340
  },
  {
    code: 'UNSAFE_VAR_ASSIGNMENT',
    message: 'Unsafe assignment to innerHTML',
    file: READABILITY_WARNING_PATH,
    line: 2,
    column: 21195
  }
] as const;
const READABILITY_PACKAGE_FIXTURE = {
  dependencies: { '@mozilla/readability': '^0.6.0' }
};
const READABILITY_LOCK_FIXTURE = {
  packages: {
    'node_modules/@mozilla/readability': {
      version: '0.6.0',
      resolved: 'https://registry.npmjs.org/@mozilla/readability/-/readability-0.6.0.tgz',
      integrity:
        'sha512-juG5VWh4qAivzTAeMzvY9xs9HY5rAcr2E4I7tiSSCokRFi7XIZCAu92ZkSTsIj1OPceCifL3cpfteP3pDT9/QQ==',
      license: 'Apache-2.0',
      engines: { node: '>=14.0.0' }
    }
  }
};

function createLintContractFiles(
  overrides: { packageJson?: unknown; packageLockJson?: unknown } = {}
) {
  return vi.fn().mockResolvedValue({
    packageJson: JSON.stringify(overrides.packageJson ?? READABILITY_PACKAGE_FIXTURE),
    packageLockJson: JSON.stringify(overrides.packageLockJson ?? READABILITY_LOCK_FIXTURE)
  });
}

function createLintResult(
  warnings: Array<Record<string, unknown>>,
  {
    errors = [],
    errorCount = errors.length,
    warningCount = warnings.length
  }: {
    errors?: Array<Record<string, unknown>>;
    errorCount?: number;
    warningCount?: number;
  } = {}
) {
  return {
    summary: { errors: errorCount, warnings: warningCount, notices: 0 },
    errors,
    warnings,
    notices: []
  };
}

function createFirefoxLintProvenanceVerifier() {
  return vi.fn().mockResolvedValue(undefined);
}

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aiiinob-package-firefox-test-'));
  tempRoots.push(root);
  return root;
}

describe('Firefox package audit', () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
    );
  });

  it('rejects zero warnings because the Readability warning contract is exact', async () => {
    const root = await createTempRoot();
    const distDir = join(root, 'dist');
    const webExt = {
      cmd: {
        lint: vi.fn().mockResolvedValue({
          summary: {
            errors: 0,
            warnings: 0,
            notices: 0
          },
          errors: [],
          warnings: [],
          notices: []
        })
      }
    };
    const logger = { log: vi.fn(), warn: vi.fn() };

    await expect(
      lintFirefoxExtension(distDir, {
        logger,
        readFirefoxLintContractFilesImpl: createLintContractFiles(),
        webExt
      })
    ).rejects.toThrow('FIREFOX_LINT_THIRD_PARTY_WARNING_COUNT_DRIFT: expected=2 actual=0');

    expect(webExt.cmd.lint).toHaveBeenCalledWith(
      {
        sourceDir: distDir,
        selfHosted: true,
        warningsAsErrors: false
      },
      { shouldExitProgram: false }
    );
    expect(logger.log).toHaveBeenCalledWith('🔎 正在运行 Firefox web-ext lint...');
  });

  it.each([
    {
      name: 'package declaration',
      contractFiles: createLintContractFiles({
        packageJson: { dependencies: { '@mozilla/readability': '0.6.1' } }
      }),
      code: 'FIREFOX_LINT_READABILITY_PACKAGE_IDENTITY_DRIFT'
    },
    {
      name: 'lock entry',
      contractFiles: createLintContractFiles({
        packageLockJson: {
          packages: {
            'node_modules/@mozilla/readability': {
              ...READABILITY_LOCK_FIXTURE.packages['node_modules/@mozilla/readability'],
              version: '0.6.1'
            }
          }
        }
      }),
      code: 'FIREFOX_LINT_READABILITY_LOCK_IDENTITY_DRIFT'
    }
  ])(
    'validates $name identity before rejecting a zero-warning lint result',
    async ({ contractFiles, code }) => {
      await expect(
        lintFirefoxExtension('/private/dist', {
          readFirefoxLintContractFilesImpl: contractFiles,
          webExt: { cmd: { lint: vi.fn().mockResolvedValue(createLintResult([])) } }
        })
      ).rejects.toThrow(code);
      expect(contractFiles).toHaveBeenCalledOnce();
    }
  );

  it('accepts only the two package-and-lock-pinned bundled Readability warnings', async () => {
    const webExt = {
      cmd: { lint: vi.fn().mockResolvedValue(createLintResult([...READABILITY_WARNING_FIXTURE])) }
    };
    const logger = { log: vi.fn(), warn: vi.fn() };

    await lintFirefoxExtension('/private/dist', {
      assertFirefoxLintProvenanceImpl: createFirefoxLintProvenanceVerifier(),
      logger,
      readFirefoxLintContractFilesImpl: createLintContractFiles(),
      webExt
    });

    expect(logger.log).toHaveBeenCalledWith(
      '✅ Firefox web-ext lint passed with 2 pinned @mozilla/readability warning(s)'
    );
  });

  it('rejects a first-party warning even when the total warning count stays pinned', async () => {
    const firstPartyWarning = {
      ...READABILITY_WARNING_FIXTURE[0],
      file: 'local-vault-permission.js'
    };

    const assertFirefoxLintProvenanceImpl = vi
      .fn()
      .mockRejectedValue(new Error('FIREFOX_LINT_FIRST_PARTY_OR_UNPINNED_WARNING'));
    await expect(
      lintFirefoxExtension('/private/dist', {
        assertFirefoxLintProvenanceImpl,
        readFirefoxLintContractFilesImpl: createLintContractFiles(),
        webExt: {
          cmd: {
            lint: vi
              .fn()
              .mockResolvedValue(
                createLintResult([firstPartyWarning, READABILITY_WARNING_FIXTURE[1]])
              )
          }
        }
      })
    ).rejects.toThrow('FIREFOX_LINT_FIRST_PARTY_OR_UNPINNED_WARNING');
    expect(assertFirefoxLintProvenanceImpl).toHaveBeenCalledOnce();
  });

  it('rejects a web-ext summary that does not enumerate every warning', async () => {
    const lintResult = createLintResult([...READABILITY_WARNING_FIXTURE]);
    lintResult.summary.warnings = 1;

    await expect(
      lintFirefoxExtension('/private/dist', {
        webExt: { cmd: { lint: vi.fn().mockResolvedValue(lintResult) } }
      })
    ).rejects.toThrow('FIREFOX_LINT_THIRD_PARTY_WARNING_COUNT_DRIFT: summary=1 entries=2');
  });

  it.each([
    { name: 'reports an error without an entry', errorCount: 1, errors: [] },
    {
      name: 'omits an enumerated error',
      errorCount: 0,
      errors: [{ code: 'BACKGROUND_SERVICE_WORKER_NOFALLBACK' }]
    }
  ])('rejects an error summary that $name', async ({ errorCount, errors }) => {
    const lintResult = createLintResult([...READABILITY_WARNING_FIXTURE], {
      errorCount,
      errors
    });
    await expect(
      lintFirefoxExtension('/private/dist', {
        readFirefoxLintContractFilesImpl: createLintContractFiles(),
        webExt: { cmd: { lint: vi.fn().mockResolvedValue(lintResult) } }
      })
    ).rejects.toThrow(
      `FIREFOX_LINT_ERROR_COUNT_DRIFT: summary=${errorCount} entries=${errors.length}`
    );
  });

  it.each([
    {
      name: 'count',
      warnings: [READABILITY_WARNING_FIXTURE[0]],
      code: 'FIREFOX_LINT_THIRD_PARTY_WARNING_COUNT_DRIFT'
    },
    {
      name: 'rule',
      warnings: [
        { ...READABILITY_WARNING_FIXTURE[0], code: 'SOME_OTHER_RULE' },
        READABILITY_WARNING_FIXTURE[1]
      ],
      code: 'FIREFOX_LINT_THIRD_PARTY_WARNING_RULE_DRIFT'
    },
    {
      name: 'message',
      warnings: [
        { ...READABILITY_WARNING_FIXTURE[0], message: 'Unsafe assignment to outerHTML' },
        READABILITY_WARNING_FIXTURE[1]
      ],
      code: 'FIREFOX_LINT_THIRD_PARTY_WARNING_MESSAGE_DRIFT'
    }
  ])('rejects $name drift in the Readability warning contract', async ({ warnings, code }) => {
    await expect(
      lintFirefoxExtension('/private/dist', {
        readFirefoxLintContractFilesImpl: createLintContractFiles(),
        assertFirefoxLintProvenanceImpl: createFirefoxLintProvenanceVerifier(),
        webExt: { cmd: { lint: vi.fn().mockResolvedValue(createLintResult(warnings)) } }
      })
    ).rejects.toThrow(code);
  });

  it.each([
    {
      name: 'package declaration',
      contractFiles: createLintContractFiles({
        packageJson: { dependencies: { '@mozilla/readability': '0.6.0' } }
      }),
      code: 'FIREFOX_LINT_READABILITY_PACKAGE_IDENTITY_DRIFT'
    },
    {
      name: 'lock entry',
      contractFiles: createLintContractFiles({
        packageLockJson: {
          packages: {
            'node_modules/@mozilla/readability': {
              ...READABILITY_LOCK_FIXTURE.packages['node_modules/@mozilla/readability'],
              version: '0.6.1'
            }
          }
        }
      }),
      code: 'FIREFOX_LINT_READABILITY_LOCK_IDENTITY_DRIFT'
    }
  ])('rejects $name drift before accepting bundled warnings', async ({ contractFiles, code }) => {
    await expect(
      lintFirefoxExtension('/private/dist', {
        readFirefoxLintContractFilesImpl: contractFiles,
        webExt: {
          cmd: {
            lint: vi.fn().mockResolvedValue(createLintResult([...READABILITY_WARNING_FIXTURE]))
          }
        }
      })
    ).rejects.toThrow(code);
  });

  it('rejects a nonzero web-ext command result', async () => {
    await expect(
      lintFirefoxExtension('/private/dist', {
        webExt: {
          cmd: { lint: vi.fn().mockRejectedValue(new Error('Command failed with exit 1')) }
        }
      })
    ).rejects.toThrow('Firefox web-ext lint failed: Command failed with exit 1');
  });

  it('fails Firefox release lint when web-ext reports validation errors', async () => {
    const root = await createTempRoot();
    const distDir = join(root, 'dist');
    const webExt = {
      cmd: {
        lint: vi.fn().mockResolvedValue({
          summary: {
            errors: 1,
            warnings: 0,
            notices: 0
          },
          errors: [{ code: 'BACKGROUND_SERVICE_WORKER_NOFALLBACK' }],
          warnings: [],
          notices: []
        })
      }
    };

    await expect(
      lintFirefoxExtension(distDir, { logger: { log: vi.fn(), warn: vi.fn() }, webExt })
    ).rejects.toThrow(
      'Firefox web-ext lint failed with 1 error(s): BACKGROUND_SERVICE_WORKER_NOFALLBACK'
    );
  });

  it('lints the final Firefox dist before creating and auditing the unsigned XPI', async () => {
    const root = await createTempRoot();
    const distDir = join(root, 'dist');
    await mkdir(distDir, { recursive: true });
    await writeFile(
      join(distDir, 'manifest.json'),
      JSON.stringify({
        manifest_version: 3,
        name: '__MSG_extName__',
        version: '0.2.0',
        host_permissions: []
      })
    );
    const steps: string[] = [];
    const lintFirefoxExtensionImpl = vi.fn(() => {
      steps.push('lint');
      return Promise.resolve();
    });
    const createUnsignedXpiImpl = vi.fn(() => {
      steps.push('xpi');
      return Promise.resolve({
        xpiName: `${RELEASE_ARTIFACT_BASE_NAME}.xpi`,
        outputPath: join(root, `${RELEASE_ARTIFACT_BASE_NAME}.xpi`),
        artifactBaseName: RELEASE_ARTIFACT_BASE_NAME
      });
    });
    const auditReleaseArchiveImpl = vi.fn(() => {
      steps.push('audit');
      return Promise.resolve();
    });

    const result = await prepareFirefoxReleasePackage(
      { distDir },
      {
        auditReleaseArchiveImpl,
        createUnsignedXpiImpl,
        lintFirefoxExtensionImpl,
        logger: { log: vi.fn(), warn: vi.fn() },
        prepareLicenseArtifactsImpl: vi.fn(() => {
          steps.push('prepare');
          return Promise.resolve();
        }),
        resolveMessageImpl: vi.fn(() => Promise.resolve(RELEASE_DISPLAY_NAME))
      }
    );

    expect(steps).toEqual(['prepare', 'lint', 'xpi', 'audit']);
    expect(lintFirefoxExtensionImpl).toHaveBeenCalledWith(distDir);
    expect(createUnsignedXpiImpl).toHaveBeenCalledWith(distDir, RELEASE_DISPLAY_NAME, '0.2.0');
    expect(auditReleaseArchiveImpl).toHaveBeenCalledWith(
      join(root, `${RELEASE_ARTIFACT_BASE_NAME}.xpi`)
    );
    expect(result).toMatchObject({
      artifactBaseName: RELEASE_ARTIFACT_BASE_NAME,
      resolvedName: RELEASE_DISPLAY_NAME,
      version: '0.2.0',
      xpiName: `${RELEASE_ARTIFACT_BASE_NAME}.xpi`
    });
  });

  it('publishes a release XPI without replacing an existing final target', async () => {
    const root = await createTempRoot();
    const distDir = join(root, 'dist');
    const outputDir = join(root, 'release');
    const workDir = join(root, '.release.work');
    await mkdir(distDir);
    await mkdir(outputDir);
    await mkdir(workDir);
    await writeFile(join(distDir, 'manifest.json'), '{}\n');

    const first = await createUnsignedXpi(distDir, RELEASE_DISPLAY_NAME, '0.2.0', {
      publication: { mode: 'release-no-replace-v1', outputDir, workDir }
    });

    await expect(readFile(first.outputPath)).resolves.toBeInstanceOf(Buffer);
    await expect(
      createUnsignedXpi(distDir, RELEASE_DISPLAY_NAME, '0.2.0', {
        publication: { mode: 'release-no-replace-v1', outputDir, workDir }
      })
    ).rejects.toThrow('FIREFOX_RELEASE_TARGET_EXISTS');
  });
});
