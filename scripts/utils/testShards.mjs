import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export function createUnitTestShards() {
  return [
    {
      id: 'background',
      patterns: ['tests/unit/background/**/*.test.ts', 'tests/unit/chrome/**/*.test.ts']
    },
    {
      id: 'content',
      patterns: ['tests/unit/content/**/*.test.ts', 'tests/unit/components/**/*.test.ts']
    },
    {
      id: 'options',
      patterns: [
        'tests/unit/optionsPreviewRuntime.test.ts',
        'tests/unit/options/**/*.test.ts',
        'tests/unit/onboarding/**/*.test.ts'
      ]
    },
    {
      id: 'shared',
      patterns: [
        'tests/unit/di/**/*.test.ts',
        'tests/unit/errors/**/*.test.ts',
        'tests/unit/i18n/**/*.test.ts',
        'tests/unit/infrastructure/**/*.test.ts',
        'tests/unit/offscreen/**/*.test.ts',
        'tests/unit/platform/**/*.test.ts',
        'tests/unit/shared/**/*.test.ts',
        'tests/unit/state/**/*.test.ts',
        'tests/unit/third_party/**/*.test.ts',
        'tests/unit/ui/**/*.test.ts'
      ]
    },
    {
      id: 'tools',
      patterns: ['tests/unit/scripts/**/*.test.ts', 'tests/unit/tools/**/*.test.ts']
    }
  ];
}

export function createE2eTestShards() {
  return [
    {
      id: 'ai-chat',
      patterns: [
        'tests/e2e/claudeAiChatFlow.test.ts',
        'tests/e2e/deepseekAiChatFlow.test.ts',
        'tests/e2e/doubaoAiChatFlow.test.ts',
        'tests/e2e/kimiAiChatFlow.test.ts',
        'tests/e2e/monicaAiChatFlow.test.ts',
        'tests/e2e/perplexityAiChatFlow.test.ts',
        'tests/e2e/tongyiAiChatFlow.test.ts'
      ]
    },
    {
      id: 'content',
      patterns: [
        'tests/e2e/articleExtractionHardening.test.ts',
        'tests/e2e/clipperFlow.test.ts',
        'tests/e2e/content-scripts-repository.test.ts',
        'tests/e2e/multilingualExpansion.test.ts',
        'tests/e2e/supportPromptFlow.test.ts'
      ]
    },
    {
      id: 'options',
      patterns: [
        'tests/e2e/optionsLanguageSwitch.test.ts',
        'tests/e2e/optionsNavigationLazyLoad.test.ts',
        'tests/e2e/yamlOverridesFlow.test.ts',
        'tests/e2e/phase4/**/*.test.ts'
      ]
    },
    {
      id: 'video',
      patterns: ['tests/e2e/videoListenerScope.fixture.test.ts']
    }
  ];
}

export function collectShardCoverage(shards, files) {
  const ownersByFile = new Map(files.map((file) => [file, []]));

  for (const shard of shards) {
    for (const file of files) {
      if (shard.patterns.some((pattern) => matchesPattern(file, pattern))) {
        ownersByFile.get(file).push(shard.id);
      }
    }
  }

  return {
    missing: Array.from(ownersByFile.entries())
      .filter(([, owners]) => owners.length === 0)
      .map(([file]) => file)
      .sort(),
    duplicates: Array.from(ownersByFile.entries())
      .filter(([, owners]) => owners.length > 1)
      .map(([file, owners]) => ({ file, owners }))
      .sort((left, right) => left.file.localeCompare(right.file))
  };
}

export function expandShardPatterns(patterns, { cwd = process.cwd() } = {}) {
  const testFiles = listTestFiles(resolve(cwd, 'tests'), cwd);
  const matched = new Set();

  for (const pattern of patterns) {
    if (!pattern.includes('*')) {
      if (existsSync(resolve(cwd, pattern))) {
        matched.add(pattern);
      }
      continue;
    }

    for (const file of testFiles) {
      if (matchesPattern(file, pattern)) {
        matched.add(file);
      }
    }
  }

  return Array.from(matched).sort();
}

function listTestFiles(root, cwd) {
  if (!existsSync(root)) {
    return [];
  }

  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory).sort()) {
      const absolutePath = join(directory, entry);
      const stats = statSync(absolutePath);
      if (stats.isDirectory()) {
        visit(absolutePath);
      } else if (stats.isFile() && entry.endsWith('.test.ts')) {
        files.push(relative(cwd, absolutePath).replaceAll('\\', '/'));
      }
    }
  };

  visit(root);
  return files;
}

function matchesPattern(file, pattern) {
  const normalizedFile = file.replaceAll('\\', '/');
  const normalizedPattern = pattern.replaceAll('\\', '/');
  if (!normalizedPattern.includes('*')) {
    return normalizedFile === normalizedPattern;
  }
  const regex = globToRegExp(normalizedPattern);
  return regex.test(normalizedFile);
}

function globToRegExp(pattern) {
  const source = pattern
    .split(/(\*\*\/|\*\*|\*)/g)
    .map((part) => {
      if (part === '**/') {
        return '(?:.*/)?';
      }
      if (part === '**') {
        return '.*';
      }
      if (part === '*') {
        return '[^/]*';
      }
      return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`);
}
