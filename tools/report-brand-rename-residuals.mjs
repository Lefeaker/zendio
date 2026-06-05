import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ALLOWLIST_PATH = 'tools/brand-rename-residual-allowlist.json';
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.cjs',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml'
]);
const TEXT_BASENAMES = new Set(['AGENTS.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']);

export function normalizePath(path) {
  return path.split(sep).join('/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function globToRegExp(glob) {
  let source = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];

    if (char === '*') {
      if (next === '*') {
        const after = glob[index + 2];
        if (after === '/') {
          source += '(?:.*/)?';
          index += 2;
        } else {
          source += '.*';
          index += 1;
        }
      } else {
        source += '[^/]*';
      }
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegExp(char);
  }

  source += '$';
  return new RegExp(source);
}

function compilePathMatchers(patterns = []) {
  return patterns.map((pattern) => globToRegExp(pattern));
}

function matchesAnyPath(path, matchers) {
  return matchers.some((matcher) => matcher.test(path));
}

function createTokenRegExp(tokens) {
  const sorted = [...tokens].sort((a, b) => b.length - a.length);
  return new RegExp(sorted.map(escapeRegExp).join('|'), 'g');
}

function isTextFile(path) {
  const name = path.split('/').at(-1) ?? path;
  return TEXT_BASENAMES.has(name) || TEXT_EXTENSIONS.has(extname(name));
}

export async function loadAllowlist(path = DEFAULT_ALLOWLIST_PATH) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

export function validateAllowlist(allowlist) {
  const errors = [];
  const requiredTokens = ['AllInObsidian', 'AllinOB'];

  for (const token of requiredTokens) {
    if (!allowlist.tokens?.includes(token)) {
      errors.push(`token set is missing ${token}`);
    }
  }

  for (const rule of allowlist.rules ?? []) {
    if (!allowlist.classes?.includes(rule.class)) {
      errors.push(`rule ${rule.id} uses unknown class ${rule.class}`);
    }
    if (rule.class === 'active-user-facing-copy') {
      errors.push(`rule ${rule.id} uses forbidden class active-user-facing-copy`);
    }
  }

  return errors;
}

async function collectTextFiles(root, allowlist, dir = root) {
  const files = [];
  const ignoreMatchers = compilePathMatchers(allowlist.ignorePaths ?? []);
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    const relativePath = normalizePath(relative(root, absolutePath));

    if (matchesAnyPath(relativePath, ignoreMatchers)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await collectTextFiles(root, allowlist, absolutePath)));
      continue;
    }

    if (entry.isFile() && isTextFile(relativePath)) {
      files.push({ absolutePath, relativePath });
    }
  }

  return files;
}

function compileRule(rule) {
  return {
    ...rule,
    pathMatchers: compilePathMatchers(rule.paths ?? ['**']),
    lineRegExp: rule.lineRegex ? new RegExp(rule.lineRegex) : null,
    lineNotRegExp: rule.lineNotRegex ? new RegExp(rule.lineNotRegex) : null
  };
}

export function classifyFinding(finding, allowlist) {
  const compiledRules = allowlist.rules.map((rule) =>
    rule.pathMatchers ? rule : compileRule(rule)
  );

  for (const rule of compiledRules) {
    if (!matchesAnyPath(finding.path, rule.pathMatchers)) {
      continue;
    }
    if (rule.tokens && !rule.tokens.includes(finding.token)) {
      continue;
    }
    if (rule.lineIncludes && !rule.lineIncludes.some((value) => finding.lineText.includes(value))) {
      continue;
    }
    if (rule.lineRegex && !new RegExp(rule.lineRegex).test(finding.lineText)) {
      continue;
    }
    if (rule.lineRegExp && !rule.lineRegExp.test(finding.lineText)) {
      continue;
    }
    if (rule.lineNotRegex && new RegExp(rule.lineNotRegex).test(finding.lineText)) {
      continue;
    }
    if (rule.lineNotRegExp && rule.lineNotRegExp.test(finding.lineText)) {
      continue;
    }

    return {
      ...finding,
      class: rule.class,
      reason: rule.reason,
      ownerConfirmationRequired: Boolean(rule.ownerConfirmationRequired),
      ruleId: rule.id
    };
  }

  return {
    ...finding,
    class: 'unclassified',
    reason: 'No residual allowlist rule matched this old-brand occurrence.',
    ownerConfirmationRequired: false,
    ruleId: null
  };
}

export async function scanResiduals(options = {}) {
  const root = options.root ?? process.cwd();
  const allowlist =
    options.allowlist ?? (await loadAllowlist(options.allowlistPath ?? DEFAULT_ALLOWLIST_PATH));
  const validationErrors = validateAllowlist(allowlist);

  if (validationErrors.length > 0) {
    return { ok: false, validationErrors, findings: [], counts: {} };
  }

  const tokenRegExp = createTokenRegExp(allowlist.tokens);
  const files = await collectTextFiles(root, allowlist);
  const compiledAllowlist = {
    ...allowlist,
    rules: allowlist.rules.map(compileRule)
  };
  const findings = [];

  for (const file of files) {
    const content = await readFile(file.absolutePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const [lineIndex, lineText] of lines.entries()) {
      tokenRegExp.lastIndex = 0;
      for (const match of lineText.matchAll(tokenRegExp)) {
        findings.push(
          classifyFinding(
            {
              path: file.relativePath,
              line: lineIndex + 1,
              column: (match.index ?? 0) + 1,
              token: match[0],
              lineText
            },
            compiledAllowlist
          )
        );
      }
    }
  }

  const counts = {};
  for (const finding of findings) {
    counts[finding.class] = (counts[finding.class] ?? 0) + 1;
  }

  const forbiddenCount = (counts.unclassified ?? 0) + (counts['active-user-facing-copy'] ?? 0);
  return {
    ok: forbiddenCount === 0,
    validationErrors: [],
    findings,
    counts
  };
}

export function formatSummary(result) {
  const lines = ['Brand rename residual summary', `total: ${result.findings.length}`];

  for (const className of Object.keys(result.counts).sort()) {
    lines.push(`${className}: ${result.counts[className]}`);
  }

  const ownerItems = result.findings.filter((finding) => finding.ownerConfirmationRequired).length;
  lines.push(`owner-confirmation-required: ${ownerItems}`);
  lines.push(`status: ${result.ok ? 'ok' : 'failed'}`);

  if (result.validationErrors.length > 0) {
    lines.push('validation-errors:');
    for (const error of result.validationErrors) {
      lines.push(`- ${error}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function formatJson(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export function parseArgs(argv) {
  const args = {
    allowlistPath: DEFAULT_ALLOWLIST_PATH,
    format: 'summary'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allowlist') {
      args.allowlistPath = argv[index + 1];
      index += 1;
    } else if (arg === '--format') {
      args.format = argv[index + 1] ?? args.format;
      index += 1;
    } else if (arg === '--json') {
      args.format = 'json';
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await scanResiduals({ allowlistPath: args.allowlistPath });

  if (args.format === 'json') {
    process.stdout.write(formatJson(result));
  } else {
    process.stdout.write(formatSummary(result));
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
