import path from 'node:path';
import ts from 'typescript';
import { normalizeRepositoryPath } from './gitInventory.mjs';

export const VITEST_CONFIG_PATHS = {
  unit: 'vitest.unit.config.ts',
  e2e: 'vitest.e2e.config.ts'
};

export const PLAYWRIGHT_CONFIG_PATHS = ['playwright.config.ts', 'playwright.reader.config.ts'];

export function parseVitestConfig(source, file = 'vitest.config.ts') {
  const config = findDefineConfigObject(source, file);
  const testObject = getObjectProperty(config, 'test');
  if (!testObject) {
    throw new Error(`${file} has no test configuration object`);
  }
  return {
    include: readStringArrayProperty(testObject, 'include', { required: true, file }),
    exclude: readStringArrayProperty(testObject, 'exclude', { required: false, file })
  };
}

export function parsePlaywrightConfig(source, file = 'playwright.config.ts') {
  const config = findDefineConfigObject(source, file);
  const testDirExpression = getPropertyInitializer(config, 'testDir');
  if (!testDirExpression) {
    throw new Error(`${file} has no testDir`);
  }
  const testDir = readRepositoryPathExpression(testDirExpression);
  if (!testDir) {
    throw new Error(`${file} testDir is not statically derivable`);
  }
  return {
    testDir,
    testMatch: readStringArrayProperty(config, 'testMatch', { required: false, file }),
    testIgnore: readStringArrayProperty(config, 'testIgnore', { required: false, file })
  };
}

function findDefineConfigObject(source, file) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    throw new Error(`${file} contains TypeScript parse errors`);
  }
  let result;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineConfig' &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      result = node.arguments[0];
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!result) {
    throw new Error(`${file} has no static defineConfig object`);
  }
  return result;
}

function getPropertyInitializer(object, name) {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const propertyName = ts.isIdentifier(property.name)
      ? property.name.text
      : ts.isStringLiteral(property.name)
        ? property.name.text
        : undefined;
    if (propertyName === name) return property.initializer;
  }
  return undefined;
}

function getObjectProperty(object, name) {
  const initializer = getPropertyInitializer(object, name);
  return initializer && ts.isObjectLiteralExpression(initializer) ? initializer : undefined;
}

function readStringArrayProperty(object, name, { required, file }) {
  const initializer = getPropertyInitializer(object, name);
  if (!initializer) {
    if (required) throw new Error(`${file} has no ${name} array`);
    return [];
  }
  if (!ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`${file} ${name} must be a static string array`);
  }
  return initializer.elements.map((element) => {
    if (!ts.isStringLiteralLike(element)) {
      throw new Error(`${file} ${name} contains a non-string member`);
    }
    return element.text;
  });
}

function readRepositoryPathExpression(expression) {
  if (ts.isStringLiteralLike(expression)) {
    return normalizeRepositoryPath(expression.text);
  }
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'path' &&
    expression.expression.name.text === 'join' &&
    expression.arguments.length >= 2 &&
    ts.isIdentifier(expression.arguments[0]) &&
    expression.arguments[0].text === '__dirname' &&
    expression.arguments.slice(1).every((argument) => ts.isStringLiteralLike(argument))
  ) {
    const parts = expression.arguments.slice(1).map((argument) => argument.text);
    return normalizeRepositoryPath(path.posix.join(...parts));
  }
  return undefined;
}

export function filterByVitestConfig(files, config) {
  return files.filter(
    (file) =>
      config.include.some((pattern) => matchesTestPattern(file, pattern)) &&
      !config.exclude.some((pattern) => matchesTestPattern(file, pattern))
  );
}

export function matchesTestPattern(file, pattern) {
  const normalizedFile = normalizeRepositoryPath(file);
  const normalizedPattern = pattern.replaceAll('\\', '/');
  if (/\r|\n/u.test(normalizedFile) || /\r|\n/u.test(normalizedPattern)) return false;
  if (!normalizedPattern.includes('*')) {
    return normalizedFile === normalizeRepositoryPath(normalizedPattern);
  }
  const source = normalizedPattern
    .split(/(\*\*\/|\*\*|\*)/gu)
    .map((part) => {
      if (part === '**/') return '(?:[\\s\\S]*/)?';
      if (part === '**') return '[\\s\\S]*';
      if (part === '*') return '[^/]*';
      return part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`, 'u').test(normalizedFile);
}
