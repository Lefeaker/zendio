export function assertEqual(actual, expected, label) {
  if (stableSerialize(actual) !== stableSerialize(expected)) {
    throw new Error(
      `${label} differs: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function assertR01BrowserJob(job, contract) {
  if (!job) throw new Error('job is missing');
  assertEqual(
    job.fields,
    ['name', 'runs-on', 'timeout-minutes', 'steps'],
    `job "${job.id}" top-level fields`
  );
  assertEqual(job.name, contract.displayName, `job "${job.id}" display name`);
  assertEqual(job.runsOn, 'ubuntu-latest', `job "${job.id}" runner`);
  const timeout = Number(job.timeoutMinutes);
  if (!Number.isInteger(timeout) || timeout < 20) {
    throw new Error(`job "${job.id}" timeout must be an integer of at least 20 minutes`);
  }
  if (job.needs !== undefined) {
    throw new Error(`job "${job.id}" must remain independent and have no needs dependency`);
  }
  if (job.if !== undefined || job.continueOnError !== undefined) {
    throw new Error(`job "${job.id}" must not be conditional or use continue-on-error`);
  }
  assertEqual(job.steps, contract.steps, `job "${job.id}" ordered step contract`);
  if (job.steps.some((step) => step.continueOnError !== undefined)) {
    throw new Error(`job "${job.id}" must not use continue-on-error`);
  }
  for (const step of job.steps) {
    if (step.if !== undefined && step.if !== 'failure()') {
      throw new Error(`job "${job.id}" has an unsupported conditional step: ${step.name}`);
    }
    if (step.if === 'failure()' && !step.name.startsWith('Upload browser ')) {
      throw new Error(`job "${job.id}" masks a non-artifact step behind failure()`);
    }
  }
}

export function invokesOwnershipAudit(value) {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/\\\r?\n/gu, '')
    .replace(/["']/gu, '')
    .replace(/\\([a-z0-9_./:-])/gu, '$1');
  const reportMarker = normalized.indexOf('report-test-suite-owner');
  const reportFilePatterns = normalized
    .split(/[\s`;&|(){}<>,=]+/u)
    .flatMap((word) => word.split('/'));
  return (
    normalized.includes('audit:test-suite-ownership') ||
    normalized.includes('report-test-suite-ownership.mjs') ||
    normalized.includes('testsuiteownership.mjs') ||
    reportFilePatterns.some((pattern) =>
      shellGlobCanMatchLiteral(pattern, 'report-test-suite-ownership.mjs')
    ) ||
    (reportMarker >= 0 && normalized.slice(reportMarker, reportMarker + 96).includes('.mjs'))
  );
}

function shellGlobCanMatchLiteral(pattern, literal) {
  const fixedCharacterCount = [...pattern].filter(
    (character) => !['?', '*', '[', ']', '!', '\\'].includes(character)
  ).length;
  if (fixedCharacterCount < 8) return false;

  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      source += '.*';
    } else if (character === '?') {
      source += '.';
    } else if (character === '\\' && index + 1 < pattern.length) {
      index += 1;
      source += escapeRegExp(pattern[index]);
    } else if (character === '[') {
      const closingIndex = pattern.indexOf(']', index + 1);
      if (closingIndex < 0) {
        source += '\\[';
      } else {
        const body = pattern.slice(index + 1, closingIndex);
        source += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`;
        index = closingIndex;
      }
    } else {
      source += escapeRegExp(character);
    }
  }

  try {
    return new RegExp(`${source}$`, 'u').test(literal);
  } catch {
    return false;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function getJobBlock(workflow, jobId) {
  const marker = `  ${jobId}:\n`;
  const start = workflow.indexOf(marker);
  if (start === -1) {
    throw new Error(`CI workflow is missing job "${jobId}".`);
  }
  const rest = workflow.slice(start + marker.length);
  const nextJob = rest.search(/\n  [a-zA-Z0-9_-]+:\n/);
  return nextJob === -1
    ? workflow.slice(start)
    : workflow.slice(start, start + marker.length + nextJob + 1);
}

export function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} is missing expected content: ${needle}`);
  }
}

export function assertNotIncludes(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`${label} still contains retired content: ${needle}`);
  }
}

export function assertJobUsesAction(jobBlock, actionPath, jobId) {
  assertIncludes(jobBlock, `uses: ${actionPath}`, `job "${jobId}"`);
}
