import path from 'node:path';
import ts from 'typescript';
import { TEST_MODULE_PATTERN, comparePaths, normalizeRepositoryPath } from './gitInventory.mjs';

export function isTestBindingName(local, imported, specifier) {
  if (['describe', 'it', 'test', 'suite'].includes(imported)) {
    return isTestApiModule(specifier) || specifier.startsWith('.');
  }
  if (/^test(?:With|$)/u.test(local)) {
    return specifier === '@playwright/test' || specifier.startsWith('.');
  }
  return false;
}

export function isTestApiModule(specifier) {
  return specifier === 'vitest' || specifier === '@playwright/test';
}

export function isTestCallee(expression, bindings, namespaces) {
  if (ts.isIdentifier(expression)) {
    return bindings.has(expression.text);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    if (
      ts.isIdentifier(expression.expression) &&
      namespaces.has(expression.expression.text) &&
      ['describe', 'it', 'test', 'suite'].includes(expression.name.text)
    ) {
      return true;
    }
    return (
      isTestCallee(expression.expression, bindings, namespaces) &&
      isRegistrationModifier(expression.name.text)
    );
  }
  return false;
}

function isRegistrationCall(node, bindings, namespaces) {
  if (
    isTestCallee(node.expression, bindings, namespaces) ||
    isDescribeCallee(node.expression, bindings, namespaces)
  ) {
    return true;
  }
  if (ts.isCallExpression(node.expression)) {
    return isRegistrationFactoryCall(node.expression, bindings, namespaces);
  }
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  const property = node.expression.name.text;
  if (property === 'describe' || property === 'each') {
    return isTestCallee(node.expression.expression, bindings, namespaces);
  }
  if (isRegistrationModifier(property)) {
    return isTestCallee(node.expression.expression, bindings, namespaces);
  }
  return false;
}

function isRegistrationFactoryCall(node, bindings, namespaces) {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text === 'each') {
    return (
      isTestCallee(node.expression.expression, bindings, namespaces) ||
      isDescribeCallee(node.expression.expression, bindings, namespaces)
    );
  }
  if (isRegistrationModifier(node.expression.name.text)) {
    return (
      isTestCallee(node.expression.expression, bindings, namespaces) ||
      isDescribeCallee(node.expression.expression, bindings, namespaces)
    );
  }
  return false;
}

function isRegistrationModifier(value) {
  return [
    'concurrent',
    'fails',
    'fixme',
    'only',
    'parallel',
    'runIf',
    'sequential',
    'serial',
    'skip',
    'skipIf',
    'todo'
  ].includes(value);
}

function isDescribeCallee(expression, bindings, namespaces) {
  if (!ts.isPropertyAccessExpression(expression)) return false;
  if (
    expression.name.text === 'describe' &&
    isTestCallee(expression.expression, bindings, namespaces)
  ) {
    return true;
  }
  if (isRegistrationModifier(expression.name.text)) {
    return isDescribeCallee(expression.expression, bindings, namespaces);
  }
  return false;
}

export function hasPotentialRegistration(root, bindings, namespaces) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node) && isRegistrationCall(node, bindings, namespaces)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

export function isDeferredFunctionNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

export function findLocalRegistrarNames(
  sourceFile,
  { testBindings, testNamespaces, synchronousCollections }
) {
  const names = new Set();
  const context = { testBindings, testNamespaces, synchronousCollections };
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      hasReachableRegistration(statement, context)
    ) {
      names.add(statement.name.text);
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        hasReachableRegistration(declaration.initializer, context)
      ) {
        names.add(declaration.name.text);
      }
    }
  }
  return names;
}

export function hasReachableRegistration(
  root,
  { testBindings, testNamespaces, synchronousCollections }
) {
  let found = false;

  const visitFunction = (node, inheritedShadowed) => {
    const shadowed = new Set(inheritedShadowed);
    if (node.name && ts.isIdentifier(node.name)) shadowed.add(node.name.text);
    for (const parameter of node.parameters ?? []) {
      collectBindingNames(parameter.name, shadowed);
    }
    if (node.body) visit(node.body, shadowed);
  };

  const visit = (node, inheritedShadowed) => {
    if (found) return;
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    let shadowed = inheritedShadowed;
    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      shadowed = new Set(inheritedShadowed);
      collectDirectScopeBindings(node, shadowed, testBindings, testNamespaces);
      for (const statement of node.statements) {
        visit(statement, shadowed);
        if (found || isDefinitelyAbruptStatement(statement)) break;
      }
      return;
    }
    if (node !== root && isDeferredFunctionNode(node)) return;

    if (ts.isIfStatement(node)) {
      visit(node.expression, shadowed);
      const condition = readStaticBoolean(node.expression);
      if (condition !== false) visit(node.thenStatement, shadowed);
      if (condition !== true && node.elseStatement) visit(node.elseStatement, shadowed);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.condition, shadowed);
      const condition = readStaticBoolean(node.condition);
      if (condition !== false) visit(node.whenTrue, shadowed);
      if (condition !== true) visit(node.whenFalse, shadowed);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(
        node.operatorToken.kind
      )
    ) {
      visit(node.left, shadowed);
      const condition = readStaticBoolean(node.left);
      if (
        node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        condition !== false
      ) {
        visit(node.right, shadowed);
      }
      if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken && condition !== true) {
        visit(node.right, shadowed);
      }
      return;
    }
    if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isSwitchStatement(node) ||
      ts.isCatchClause(node)
    ) {
      return;
    }
    if (ts.isTryStatement(node)) {
      visit(node.tryBlock, shadowed);
      if (node.finallyBlock) visit(node.finallyBlock, shadowed);
      return;
    }

    if (ts.isCallExpression(node)) {
      const activeBindings = new Set([...testBindings].filter((binding) => !shadowed.has(binding)));
      const activeNamespaces = new Set(
        [...testNamespaces].filter((binding) => !shadowed.has(binding))
      );
      if (isRegistrationCall(node, activeBindings, activeNamespaces)) {
        found = true;
        return;
      }
      const callee = unwrapExpression(node.expression);
      if (ts.isFunctionExpression(callee) || ts.isArrowFunction(callee)) {
        visitFunction(callee, shadowed);
        return;
      }
      if (isSynchronousCollectionIteration(node, synchronousCollections)) {
        for (const argument of node.arguments) {
          if (ts.isFunctionExpression(argument) || ts.isArrowFunction(argument)) {
            visitFunction(argument, shadowed);
          }
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, shadowed));
  };

  const unwrappedRoot = unwrapExpression(root);
  if (ts.isFunctionExpression(unwrappedRoot) || ts.isArrowFunction(unwrappedRoot)) {
    visitFunction(unwrappedRoot, new Set());
  } else if (ts.isFunctionDeclaration(unwrappedRoot)) {
    visitFunction(unwrappedRoot, new Set());
  } else {
    visit(unwrappedRoot, new Set());
  }
  return found;
}

function collectDirectScopeBindings(container, target, testBindings, testNamespaces) {
  for (const statement of container.statements ?? []) {
    if (ts.isImportDeclaration(statement)) continue;
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name) target.add(statement.name.text);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        isTestExtensionInitializer(declaration.initializer, testBindings, testNamespaces)
      ) {
        continue;
      }
      collectBindingNames(declaration.name, target);
    }
  }
}

export function collectBindingNames(name, target) {
  if (ts.isIdentifier(name)) {
    target.add(name.text);
    return;
  }
  for (const element of name.elements ?? []) {
    if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, target);
  }
}

export function collectDirectDeclaredNames(container) {
  const names = new Set();
  for (const statement of container.statements ?? []) {
    if (ts.isImportDeclaration(statement)) continue;
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name) names.add(statement.name.text);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      collectBindingNames(declaration.name, names);
    }
  }
  return names;
}

export function readDynamicImportSpecifier(expression) {
  let current = unwrapExpression(expression);
  while (ts.isAwaitExpression(current)) current = unwrapExpression(current.expression);
  if (
    ts.isCallExpression(current) &&
    current.expression.kind === ts.SyntaxKind.ImportKeyword &&
    current.arguments.length === 1 &&
    ts.isStringLiteralLike(current.arguments[0])
  ) {
    return current.arguments[0].text;
  }
  return undefined;
}

export function collectDynamicImportSpecifiers(root) {
  const specifiers = new Set();
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return [...specifiers];
}

export function readBindingPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return undefined;
}

export function readDirectDynamicRegistrarCall(node) {
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;
  const specifier = readDynamicImportSpecifier(node.expression.expression);
  if (!specifier) return undefined;
  return { specifier, imported: node.expression.name.text };
}

function isTestExtensionInitializer(initializer, testBindings, testNamespaces) {
  const expression = unwrapExpression(initializer);
  return (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'extend' &&
    isTestCallee(expression.expression.expression, testBindings, testNamespaces)
  );
}

export function isSynchronousCollectionIteration(node, bindings) {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== 'forEach') return false;
  const receiver = unwrapExpression(node.expression.expression);
  if (ts.isArrayLiteralExpression(receiver)) return receiver.elements.length > 0;
  return ts.isIdentifier(receiver) && (bindings.get(receiver.text) ?? 0) > 0;
}

export function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

const STATIC_UNKNOWN = Symbol('static-unknown');

export function readStaticBoolean(node) {
  const value = readStaticPrimitive(node);
  return value === STATIC_UNKNOWN ? undefined : Boolean(value);
}

function readStaticPrimitive(node) {
  const expression = unwrapExpression(node);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isVoidExpression(expression)) return undefined;
  if (ts.isPrefixUnaryExpression(expression)) {
    const operand = readStaticPrimitive(expression.operand);
    if (operand === STATIC_UNKNOWN) return STATIC_UNKNOWN;
    if (expression.operator === ts.SyntaxKind.ExclamationToken) return !operand;
    if (expression.operator === ts.SyntaxKind.PlusToken && typeof operand === 'number') {
      return +operand;
    }
    if (expression.operator === ts.SyntaxKind.MinusToken && typeof operand === 'number') {
      return -operand;
    }
    return STATIC_UNKNOWN;
  }
  if (ts.isBinaryExpression(expression)) {
    const left = readStaticPrimitive(expression.left);
    const right = readStaticPrimitive(expression.right);
    if (left === STATIC_UNKNOWN || right === STATIC_UNKNOWN) return STATIC_UNKNOWN;
    switch (expression.operatorToken.kind) {
      case ts.SyntaxKind.EqualsEqualsEqualsToken:
        return left === right;
      case ts.SyntaxKind.ExclamationEqualsEqualsToken:
        return left !== right;
      case ts.SyntaxKind.EqualsEqualsToken:
        return (
          left === right ||
          ((left === null || left === undefined) && (right === null || right === undefined))
        );
      case ts.SyntaxKind.ExclamationEqualsToken:
        return !(
          left === right ||
          ((left === null || left === undefined) && (right === null || right === undefined))
        );
      case ts.SyntaxKind.LessThanToken:
        return left < right;
      case ts.SyntaxKind.LessThanEqualsToken:
        return left <= right;
      case ts.SyntaxKind.GreaterThanToken:
        return left > right;
      case ts.SyntaxKind.GreaterThanEqualsToken:
        return left >= right;
      default:
        return STATIC_UNKNOWN;
    }
  }
  return STATIC_UNKNOWN;
}

export function isDefinitelyAbruptStatement(statement) {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) {
    for (const child of statement.statements) {
      if (isDefinitelyAbruptStatement(child)) return true;
    }
    return false;
  }
  if (ts.isIfStatement(statement)) {
    const condition = readStaticBoolean(statement.expression);
    if (condition === true) return isDefinitelyAbruptStatement(statement.thenStatement);
    if (condition === false) {
      return Boolean(
        statement.elseStatement && isDefinitelyAbruptStatement(statement.elseStatement)
      );
    }
    return Boolean(
      statement.elseStatement &&
      isDefinitelyAbruptStatement(statement.thenStatement) &&
      isDefinitelyAbruptStatement(statement.elseStatement)
    );
  }
  if (ts.isTryStatement(statement)) {
    if (statement.finallyBlock && isDefinitelyAbruptStatement(statement.finallyBlock)) return true;
    if (!isDefinitelyAbruptStatement(statement.tryBlock)) return false;
    return !statement.catchClause || isDefinitelyAbruptStatement(statement.catchClause.block);
  }
  return false;
}

export function hasExportModifier(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function hasDefaultModifier(node) {
  return Boolean(
    node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
  );
}

export function getExportedFunctionName(node) {
  if (!ts.isFunctionDeclaration(node) || !hasExportModifier(node) || !node.body) return undefined;
  if (hasDefaultModifier(node)) return 'default';
  return node.name?.text;
}

export function buildImportLinks(modules, invalidDescriptors) {
  const links = [];
  const fileSet = new Set(modules.keys());
  const unresolved = new Set();
  for (const [file, module] of modules) {
    for (const imported of module.imports) {
      const target = resolveTestImport(file, imported.specifier, fileSet);
      if (target) {
        links.push({ importer: file, imported: target, dynamic: imported.dynamic });
        continue;
      }
      if (
        imported.specifier.startsWith('.') &&
        createTestImportCandidates(file, imported.specifier).some((candidate) =>
          TEST_MODULE_PATTERN.test(candidate)
        )
      ) {
        unresolved.add(`${file} -> ${imported.specifier}`);
      }
    }
    for (const specifier of module.dynamicImportSpecifiers) {
      if (
        specifier.startsWith('.') &&
        !resolveTestImport(file, specifier, fileSet) &&
        createTestImportCandidates(file, specifier).some((candidate) =>
          TEST_MODULE_PATTERN.test(candidate)
        )
      ) {
        unresolved.add(`${file} -> ${specifier}`);
      }
    }
  }
  for (const entry of [...unresolved].sort(comparePaths)) {
    invalidDescriptors.push(`unresolved test-module import: ${entry}`);
  }
  return links;
}

function resolveTestImport(importer, specifier, fileSet) {
  if (!specifier.startsWith('.')) return undefined;
  return createTestImportCandidates(importer, specifier).find((candidate) =>
    fileSet.has(candidate)
  );
}

function createTestImportCandidates(importer, specifier) {
  const base = normalizeRepositoryPath(path.posix.join(path.posix.dirname(importer), specifier));
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`];
}

export function findStructurallyReachableModules(runnableFiles, importLinks) {
  const reachable = new Set(runnableFiles);
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of importLinks) {
      if (reachable.has(link.importer) && !reachable.has(link.imported)) {
        reachable.add(link.imported);
        changed = true;
      }
    }
  }
  return reachable;
}

export function findRegistrarConsumption(file, module, modules) {
  const callers = new Set();
  const consumedExports = new Set();
  const fileSet = new Set(modules.keys());
  for (const [callerFile, caller] of modules) {
    if (!caller.directRegistration) continue;
    for (const [local, binding] of caller.importedBindings) {
      const target = resolveTestImport(callerFile, binding.specifier, fileSet);
      const called =
        (binding.imported === '*' &&
          [...module.exportedRegistrars].some((exported) =>
            caller.calledProperties.has(`${local}\0${exported}`)
          )) ||
        (binding.imported !== '*' &&
          module.exportedRegistrars.has(binding.imported) &&
          caller.calledIdentifiers.has(local));
      if (target === file && called) {
        callers.add(callerFile);
        if (binding.imported === '*') {
          for (const exported of module.exportedRegistrars) {
            if (caller.calledProperties.has(`${local}\0${exported}`)) {
              consumedExports.add(exported);
            }
          }
        } else {
          consumedExports.add(binding.imported);
        }
      }
    }
    for (const dynamicCall of caller.dynamicRegistrarCalls) {
      const target = resolveTestImport(callerFile, dynamicCall.specifier, fileSet);
      if (target === file && module.exportedRegistrars.has(dynamicCall.imported)) {
        callers.add(callerFile);
        consumedExports.add(dynamicCall.imported);
      }
    }
  }
  return {
    callers: [...callers].sort(comparePaths),
    allConsumed:
      module.exportedRegistrars.size > 0 &&
      [...module.exportedRegistrars].every((exported) => consumedExports.has(exported))
  };
}
