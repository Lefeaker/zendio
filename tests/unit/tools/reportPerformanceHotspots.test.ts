import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TARGET_BUDGETS: Record<string, number> = {
  'src/background/services/optionsMutationCoordinator.ts': 360,
  'src/content/video/videoScreenshotPreparationCoordinator.ts': 147,
  'src/content/video/videoScreenshotPreparationQueueOwner.ts': 180,
  'src/options/state/optionsStore.ts': 319,
  'src/shared/analytics/analyticsConfigContract.ts': 40,
  'src/shared/analytics/analyticsRuntimeConfig.ts': 190,
  'src/shared/errors/analytics/analyticsConfig.ts': 330
};

const CHANGED_BUDGET_PATHS = new Set([
  'src/background/services/optionsMutationCoordinator.ts',
  'src/content/video/videoScreenshotPreparationQueueOwner.ts',
  'src/options/state/optionsStore.ts',
  'src/shared/analytics/analyticsConfigContract.ts',
  'src/shared/analytics/analyticsRuntimeConfig.ts',
  'src/shared/errors/analytics/analyticsConfig.ts',
  'src/shared/errors/analytics/analyticsConfig.template.ts'
]);

describe('report-performance-hotspots', () => {
  const toolPath = resolve('tools/report-performance-hotspots.mjs');

  function createFixtureRepo(files: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), 'aiiinob-hotspots-'));

    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    for (const [relativePath, source] of Object.entries(files)) {
      const fullPath = join(root, relativePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, source);
    }
    execFileSync('git', ['add', 'src'], { cwd: root, stdio: 'ignore' });

    return root;
  }

  function createSourceWithLines(lineCount: number) {
    return Array.from(
      { length: lineCount },
      (_, index) => `export const line${index} = ${index};`
    ).join('\n');
  }

  function writeBudgets(root: string, budgets: Record<string, number>): string {
    const budgetPath = join(root, 'budgets.json');
    writeFileSync(budgetPath, JSON.stringify(budgets));
    return budgetPath;
  }

  function runTool(root: string, budgetPath: string): string {
    return execFileSync(process.execPath, [toolPath, '--root', root, '--budget-json', budgetPath], {
      encoding: 'utf8',
      stdio: 'pipe'
    });
  }

  function readRegisteredBudgets(): Map<string, number> {
    const source = readFileSync(toolPath, 'utf8');
    return new Map(
      [...source.matchAll(/\['([^']+)', (\d+)\]/gu)].map((match) => [
        match[1] ?? '',
        Number(match[2])
      ])
    );
  }

  it('counts physical lines without adding a phantom final line', () => {
    const moduleUrl = pathToFileURL(toolPath).href;
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `const { countPhysicalLines } = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(JSON.stringify(['', 'one', 'one\\n', 'one\\ntwo', 'one\\ntwo\\n', 'one\\r\\ntwo\\r\\n'].map(countPhysicalLines)));`
      ],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    expect(JSON.parse(output)).toEqual([0, 1, 1, 2, 2, 2]);
  });

  it('keeps the exact normalized budget transitions and every other budget unchanged', () => {
    const registeredBudgets = readRegisteredBudgets();
    const reviewedChanges: Array<[string, number, number]> = [
      ['src/i18n/generated/messages.generated.ts', 1144, 1157],
      ['src/i18n/generated/schemaCore.generated.ts', 445, 457],
      ['src/options/app/productionStitchRenderLifecycle.ts', 253, 254]
    ];
    for (const [file, before, after] of reviewedChanges) {
      expect(registeredBudgets.get(file)).toBe(after);
      registeredBudgets.set(file, before);
    }
    // Verify the reviewed recovery delta, then reconstruct the prior map so the
    // existing hash continues to protect every unrelated budget unchanged.
    const recovery: Array<[string, number | null, number]> = [
      ['src/background/listeners/sessionDraftMessages.ts', null, 260],
      ['src/background/services/notifications.ts', 451, 452],
      ['src/background/services/sessionDraftOwnerLivenessProbe.ts', null, 266],
      ['src/background/services/sessionDraftStore.ts', null, 274],
      ['src/background/services/sessionDraftStoreMutations.ts', null, 267],
      ['src/content/reader/readerSessionDraftController.ts', null, 261],
      ['src/content/reader/session.ts', 575, 613],
      ['src/content/reader/sessionOperations.ts', 643, 659],
      ['src/content/video/sessionOperations.ts', 433, 442],
      ['src/content/video/videoSessionDraftController.ts', 401, 416],
      ['src/content/video/videoSessionRuntime.ts', 531, 563],
      ['src/i18n/generated/messages.generated.ts', 1142, 1144],
      ['src/shared/sessionDrafts/index.ts', null, 251],
      ['src/shared/sessionDrafts/pageIdentity.ts', null, 251]
    ];
    expect(registeredBudgets.size).toBe(156);
    for (const [file, before, after] of recovery) {
      expect(registeredBudgets.get(file)).toBe(after);
      if (before === null) registeredBudgets.delete(file);
      else registeredBudgets.set(file, before);
    }
    expect(registeredBudgets.size).toBe(149);
    for (const [relativePath, budget] of Object.entries(TARGET_BUDGETS)) {
      expect(registeredBudgets.get(relativePath)).toBe(budget);
    }
    expect(registeredBudgets.has('src/shared/errors/analytics/analyticsConfig.template.ts')).toBe(
      false
    );

    const unchangedBudgetRows = [...registeredBudgets.entries()]
      .filter(([relativePath]) => !CHANGED_BUDGET_PATHS.has(relativePath))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([relativePath, budget]) => `${relativePath}\t${String(budget)}\n`)
      .join('');
    expect(createHash('sha256').update(unchangedBudgetRows).digest('hex')).toBe(
      '2916a0253a323a71f2702e65cb86d6ed1e95cd5279eff128a83e0f06c00fcb67'
    );
  });

  it('removes retired UI budgets while preserving current hotspot registrations', () => {
    const source = readFileSync(toolPath, 'utf8');

    expect(source).toContain('src/i18n/generated/schemaCore.generated.ts');
    expect(source).toContain('src/content/reader/utils/markdownBuilder.ts');
    expect(source).toContain('src/options/app/productionStitchLocalization.ts');
    expect(source).not.toContain('src/ui/domains/privacy/');
    expect(source).not.toContain('src/ui/domains/reading/');
    expect(source).not.toContain('src/ui/domains/vault-router/');
    expect(source).not.toContain('src/ui/domains/video/');
    expect(source).toContain('src/content/video/videoScreenshotPreparationRequestStore.ts');
    expect(source).toContain('src/background/listeners/runtimeMessages.ts');
    expect(source).toContain('src/content/video/videoCaptureMutationTransaction.ts');
    expect(source).not.toContain('src/content/reader/ui/ReaderDialogPanel.ts');
    expect(source).not.toContain('src/content/video/ui/VideoDialogPanel.ts');
    expect(source).toContain('src/dev/contentOrchestratorHarness.ts');
  });

  it('fails when a newly discovered >250 LOC src file has no registered budget', () => {
    const root = createFixtureRepo({
      'src/newLargeFile.ts': createSourceWithLines(251)
    });
    const budgetPath = join(root, 'budgets.json');
    writeFileSync(budgetPath, '{}');

    try {
      expect(() =>
        execFileSync(process.execPath, [toolPath, '--root', root, '--budget-json', budgetPath], {
          encoding: 'utf8',
          stdio: 'pipe'
        })
      ).toThrow(/Missing line budgets.*src\/newLargeFile\.ts/s);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(Object.entries(TARGET_BUDGETS))(
    'checks the registered %s budget even when it is below hotspot discovery',
    (relativePath, budget) => {
      const root = createFixtureRepo({
        [relativePath]: createSourceWithLines(budget)
      });
      const budgetPath = writeBudgets(root, { [relativePath]: budget });

      try {
        expect(runTool(root, budgetPath)).toContain('exceeded=0');
        writeFileSync(join(root, relativePath), createSourceWithLines(budget + 1));
        expect(() => runTool(root, budgetPath)).toThrow(
          new RegExp(`${relativePath.replaceAll('/', '\\/')} exceeds hotspot line budget`)
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

  it('fails when a registered budget points to a file that no longer exists', () => {
    const root = createFixtureRepo({
      'src/currentSmallFile.ts': createSourceWithLines(20)
    });
    const budgetPath = join(root, 'budgets.json');
    writeFileSync(
      budgetPath,
      JSON.stringify({
        'src/deletedLargeFile.ts': 300
      })
    );

    try {
      expect(() =>
        execFileSync(process.execPath, [toolPath, '--root', root, '--budget-json', budgetPath], {
          encoding: 'utf8',
          stdio: 'pipe'
        })
      ).toThrow(/Stale line budgets.*src\/deletedLargeFile\.ts/s);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips tracked src files deleted in the working tree before reading source', () => {
    const root = createFixtureRepo({
      'src/currentSmallFile.ts': createSourceWithLines(20),
      'src/pendingDelete.ts': createSourceWithLines(20)
    });
    const budgetPath = join(root, 'budgets.json');
    writeFileSync(budgetPath, '{}');
    rmSync(join(root, 'src/pendingDelete.ts'));

    try {
      const output = execFileSync(
        process.execPath,
        [toolPath, '--root', root, '--budget-json', budgetPath],
        {
          encoding: 'utf8',
          stdio: 'pipe'
        }
      );

      expect(output).toContain('dynamic hotspot coverage: sourceFiles=1');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses a NUL-safe current regular-file inventory without following symlinks', () => {
    const root = createFixtureRepo({
      'src/ leading space.ts': 'export const leading = true;',
      'src/line\nbreak.ts': 'export const newline = true;'
    });
    const outsideTarget = join(root, 'outside-target.ts');
    writeFileSync(outsideTarget, createSourceWithLines(400));
    symlinkSync(outsideTarget, join(root, 'src/symlink.ts'));
    execFileSync('git', ['add', 'src/symlink.ts'], { cwd: root, stdio: 'ignore' });
    const budgetPath = writeBudgets(root, {});

    try {
      const output = runTool(root, budgetPath);
      expect(output).toContain('dynamic hotspot coverage: sourceFiles=2');
      expect(output).toContain('currentRegularFiles=2');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('searches every current regular src file for prettier-ignore bytes', () => {
    const root = createFixtureRepo({
      'src/currentSmallFile.ts': 'export const current = true;',
      'src/styles.css': '/* prettier-ignore */\n.rule { color: red; }'
    });
    const budgetPath = writeBudgets(root, {});

    try {
      expect(() => runTool(root, budgetPath)).toThrow(
        /prettier-ignore suppressions.*src\/styles\.css/s
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('includes untracked current src files in hotspot coverage truth', () => {
    const root = createFixtureRepo({
      'src/currentSmallFile.ts': createSourceWithLines(20)
    });
    const budgetPath = join(root, 'budgets.json');
    writeFileSync(join(root, 'src/generatedLargeFile.ts'), createSourceWithLines(251), 'utf8');
    writeFileSync(
      budgetPath,
      JSON.stringify({
        'src/generatedLargeFile.ts': 251
      })
    );

    try {
      const output = execFileSync(
        process.execPath,
        [toolPath, '--root', root, '--budget-json', budgetPath],
        {
          encoding: 'utf8',
          stdio: 'pipe'
        }
      );

      expect(output).toContain('src/generatedLargeFile.ts: lines=251');
      expect(output).toContain('dynamic hotspot coverage: sourceFiles=2');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('is import-safe and the checked-in tree has explicit zero violations', () => {
    const importOutput = execFileSync(
      process.execPath,
      ['--input-type=module', '--eval', `await import(${JSON.stringify(toolPath)});`],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    expect(importOutput).toBe('');

    const output = execFileSync(process.execPath, [toolPath], {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    expect(output).toContain('violations: prettierIgnore=0, missing=0, stale=0, exceeded=0');
  });
});
