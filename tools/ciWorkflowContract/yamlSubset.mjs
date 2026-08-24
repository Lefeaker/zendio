export function parseCiWorkflowJobs(workflow) {
  const lines = workflow.replaceAll('\r\n', '\n').split('\n');
  const jobsIndex = lines.findIndex((line) => line === 'jobs:');
  if (jobsIndex < 0) {
    throw new Error('CI workflow has no top-level jobs mapping.');
  }
  const topLevelFields = lines.map((line) => parseYamlField(line, 0)?.key).filter(Boolean);

  const jobs = new Map();
  const order = [];
  let currentJob;
  let currentStep;
  let inSteps = false;
  let inWith = false;

  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && !line.startsWith(' ')) {
      break;
    }

    const jobMatch = parseYamlField(line, 2);
    if (jobMatch) {
      const id = jobMatch.key;
      if (jobMatch.rawValue !== '') {
        throw new Error(`CI workflow job "${id}" must be a mapping.`);
      }
      if (jobs.has(id)) {
        throw new Error(`CI workflow contains duplicate job "${id}".`);
      }
      currentJob = { id, fields: [], steps: [] };
      jobs.set(id, currentJob);
      order.push(id);
      currentStep = undefined;
      inSteps = false;
      inWith = false;
      continue;
    }
    if (!currentJob) continue;

    const jobField = parseYamlField(line, 4);
    if (jobField) {
      const { key, rawValue } = jobField;
      currentJob.fields.push(key);
      if (key === 'steps') {
        inSteps = true;
      } else if (
        ['name', 'runs-on', 'timeout-minutes', 'needs', 'if', 'continue-on-error'].includes(key)
      ) {
        currentJob[toCamelCase(key)] = parseYamlScalar(rawValue);
      }
      currentStep = undefined;
      inWith = false;
      continue;
    }
    if (!inSteps) continue;

    const stepStart = parseYamlField(line, 6, true);
    if (stepStart) {
      const { key, rawValue } = stepStart;
      currentStep = {};
      currentJob.steps.push(currentStep);
      currentStep[toCamelCase(key)] = parseYamlScalar(rawValue);
      inWith = false;
      continue;
    }
    if (!currentStep) continue;

    const stepField = parseYamlField(line, 8);
    if (stepField) {
      const { key, rawValue } = stepField;
      if (key === 'with') {
        currentStep.with = {};
        inWith = true;
        continue;
      }
      inWith = false;
      if (rawValue === '|') {
        const block = readYamlBlock(lines, index, 8);
        currentStep[toCamelCase(key)] = block.value;
        index = block.nextIndex - 1;
      } else {
        currentStep[toCamelCase(key)] = parseYamlScalar(rawValue);
      }
      continue;
    }

    if (inWith) {
      const withField = parseYamlField(line, 10);
      if (withField) {
        const { key, rawValue } = withField;
        if (rawValue === '|') {
          const block = readYamlBlock(lines, index, 10);
          currentStep.with[key] = block.value;
          index = block.nextIndex - 1;
        } else {
          currentStep.with[key] = parseYamlScalar(rawValue);
        }
      }
    }
  }

  return { order, jobs, topLevelFields };
}

function parseYamlField(line, indentation, sequence = false) {
  const prefix = `${' '.repeat(indentation)}${sequence ? '- ' : ''}`;
  if (!line.startsWith(prefix)) return undefined;
  const rest = line.slice(prefix.length);
  let key;
  let remainder;
  if (rest.startsWith('"')) {
    const match = /^("(?:\\.|[^"\\])*"):(.*)$/u.exec(rest);
    if (!match) return undefined;
    key = decodeYamlDoubleQuotedKey(match[1]);
    if (key === undefined) return undefined;
    remainder = match[2];
  } else if (rest.startsWith("'")) {
    const match = /^('(?:''|[^'])*'):(.*)$/u.exec(rest);
    if (!match) return undefined;
    key = match[1].slice(1, -1).replaceAll("''", "'");
    remainder = match[2];
  } else {
    const match = /^([A-Za-z0-9_-]+):(.*)$/u.exec(rest);
    if (!match) return undefined;
    key = match[1];
    remainder = match[2];
  }
  if (typeof key !== 'string' || !/^\s*(?:\S[\s\S]*)?$/u.test(remainder)) return undefined;
  return { key, rawValue: remainder.trimStart() };
}

function decodeYamlDoubleQuotedKey(value) {
  const simpleEscapes = new Map([
    ['0', '\u0000'],
    ['a', '\u0007'],
    ['b', '\b'],
    ['t', '\t'],
    ['n', '\n'],
    ['v', '\u000b'],
    ['f', '\f'],
    ['r', '\r'],
    ['e', '\u001b'],
    [' ', ' '],
    ['"', '"'],
    ['/', '/'],
    ['\\', '\\'],
    ['N', '\u0085'],
    ['_', '\u00a0'],
    ['L', '\u2028'],
    ['P', '\u2029']
  ]);
  let decoded = '';

  for (let index = 1; index < value.length - 1; index += 1) {
    const character = value[index];
    if (character !== '\\') {
      decoded += character;
      continue;
    }

    const escape = value[index + 1];
    if (simpleEscapes.has(escape)) {
      decoded += simpleEscapes.get(escape);
      index += 1;
      continue;
    }

    const width = escape === 'x' ? 2 : escape === 'u' ? 4 : escape === 'U' ? 8 : 0;
    const digits = value.slice(index + 2, index + 2 + width);
    if (width === 0 || digits.length !== width || !/^[0-9a-f]+$/iu.test(digits)) {
      return undefined;
    }
    const codePoint = Number.parseInt(digits, 16);
    if (codePoint > 0x10ffff) return undefined;
    decoded += String.fromCodePoint(codePoint);
    index += width + 1;
  }

  return decoded;
}

function readYamlBlock(lines, parentIndex, parentIndent) {
  const blockLines = [];
  let nextIndex = parentIndex + 1;
  for (; nextIndex < lines.length; nextIndex += 1) {
    const line = lines[nextIndex];
    if (line.length === 0) {
      blockLines.push('');
      continue;
    }
    const indentation = line.match(/^ */u)?.[0].length ?? 0;
    if (indentation <= parentIndent) break;
    blockLines.push(line);
  }
  while (blockLines.at(-1) === '') blockLines.pop();
  const nonEmpty = blockLines.filter((line) => line.trim().length > 0);
  const commonIndent =
    nonEmpty.length === 0
      ? parentIndent + 2
      : Math.min(...nonEmpty.map((line) => line.match(/^ */u)?.[0].length ?? 0));
  return {
    value: blockLines.map((line) => line.slice(Math.min(commonIndent, line.length))).join('\n'),
    nextIndex
  };
}

function parseYamlScalar(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}
