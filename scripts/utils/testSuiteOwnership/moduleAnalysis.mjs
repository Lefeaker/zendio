import ts from 'typescript';
import {
  collectBindingNames,
  collectDirectDeclaredNames,
  collectDynamicImportSpecifiers,
  findLocalRegistrarNames,
  getExportedFunctionName,
  hasExportModifier,
  hasPotentialRegistration,
  hasReachableRegistration,
  isDefinitelyAbruptStatement,
  isDeferredFunctionNode,
  isSynchronousCollectionIteration,
  isTestApiModule,
  isTestBindingName,
  isTestCallee,
  readBindingPropertyName,
  readDirectDynamicRegistrarCall,
  readDynamicImportSpecifier,
  readStaticBoolean,
  unwrapExpression
} from './registrationFlow.mjs';

export function analyzeTestModule(file, source, { allowGlobalTestApi = true } = {}) {
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
  const testBindings = new Set(allowGlobalTestApi ? ['describe', 'it', 'test', 'suite'] : []);
  const suiteBindings = new Set(allowGlobalTestApi ? ['describe', 'suite'] : []);
  const testNamespaces = new Set();
  const imports = [];
  const importedBindings = new Map();
  const exportedRegistrars = new Set();
  const synchronousCollections = findSynchronousCollectionBindings(sourceFile);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const specifier = statement.moduleSpecifier.text;
    const bindings = [];
    const clause = statement.importClause;
    const clauseIsTypeOnly = Boolean(clause?.isTypeOnly);
    if (clause?.name && !clauseIsTypeOnly) {
      bindings.push({ imported: 'default', local: clause.name.text });
    }
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        if (clauseIsTypeOnly || element.isTypeOnly) continue;
        bindings.push({
          imported: element.propertyName?.text ?? element.name.text,
          local: element.name.text
        });
      }
    }
    if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings) && !clauseIsTypeOnly) {
      bindings.push({ imported: '*', local: clause.namedBindings.name.text });
    }
    for (const binding of bindings) {
      importedBindings.set(binding.local, { specifier, imported: binding.imported });
      if (isTestBindingName(binding.local, binding.imported, specifier)) {
        testBindings.add(binding.local);
        if (binding.imported === 'describe' || binding.imported === 'suite') {
          suiteBindings.add(binding.local);
        }
      }
      if (binding.imported === '*' && isTestApiModule(specifier)) {
        testNamespaces.add(binding.local);
      }
    }
    if (!clause || bindings.length > 0) {
      imports.push({ specifier, bindings, dynamic: false });
    }
  }

  const discoverBindings = (node) => {
    if (node !== sourceFile && isDeferredFunctionNode(node)) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (
        ts.isCallExpression(node.initializer) &&
        ts.isPropertyAccessExpression(node.initializer.expression) &&
        node.initializer.expression.name.text === 'extend' &&
        isTestCallee(node.initializer.expression.expression, testBindings, testNamespaces)
      ) {
        testBindings.add(node.name.text);
      }
    }
    ts.forEachChild(node, discoverBindings);
  };
  discoverBindings(sourceFile);

  const localRegistrars = findLocalRegistrarNames(sourceFile, {
    testBindings,
    testNamespaces,
    synchronousCollections
  });
  for (const statement of sourceFile.statements) {
    const exportedFunctionName = getExportedFunctionName(statement);
    if (
      exportedFunctionName &&
      hasReachableRegistration(statement, {
        testBindings,
        testNamespaces,
        synchronousCollections
      })
    ) {
      exportedRegistrars.add(exportedFunctionName);
    }
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && localRegistrars.has(declaration.name.text)) {
          exportedRegistrars.add(declaration.name.text);
        }
      }
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      if (
        (ts.isIdentifier(statement.expression) && localRegistrars.has(statement.expression.text)) ||
        hasReachableRegistration(statement.expression, {
          testBindings,
          testNamespaces,
          synchronousCollections
        })
      ) {
        exportedRegistrars.add('default');
      }
    }
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        const local = element.propertyName?.text ?? element.name.text;
        if (localRegistrars.has(local)) exportedRegistrars.add(element.name.text);
      }
    }
  }

  const directRegistration = hasReachableRegistration(sourceFile, {
    testBindings,
    testNamespaces,
    synchronousCollections
  });
  const potentialRegistration = hasPotentialRegistration(sourceFile, testBindings, testNamespaces);
  const dynamicImportSpecifiers = collectDynamicImportSpecifiers(sourceFile);
  const discoveryEffects = collectDiscoveryEffects(sourceFile, {
    testBindings,
    suiteBindings,
    testNamespaces,
    synchronousCollections,
    importedBindingNames: new Set(importedBindings.keys())
  });
  for (const [local, binding] of discoveryEffects.dynamicBindings) {
    importedBindings.set(local, { ...binding, dynamic: true });
  }
  imports.push(
    ...discoveryEffects.dynamicImports.map((specifier) => ({
      specifier,
      bindings: [],
      dynamic: true
    }))
  );

  return {
    file,
    source,
    directRegistration,
    potentialRegistration,
    dynamicImportSpecifiers,
    imports,
    importedBindings,
    calledIdentifiers: discoveryEffects.calledIdentifiers,
    calledProperties: discoveryEffects.calledProperties,
    dynamicRegistrarCalls: discoveryEffects.dynamicRegistrarCalls,
    exportedRegistrars
  };
}

function findSynchronousCollectionBindings(sourceFile) {
  const bindings = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        ts.isArrayLiteralExpression(unwrapExpression(declaration.initializer))
      ) {
        bindings.set(
          declaration.name.text,
          unwrapExpression(declaration.initializer).elements.length
        );
      }
    }
  }
  return bindings;
}

function collectDiscoveryEffects(
  sourceFile,
  { testBindings, suiteBindings, testNamespaces, synchronousCollections, importedBindingNames }
) {
  const calledIdentifiers = new Set();
  const calledProperties = new Set();
  const dynamicImports = new Set();
  const dynamicBindings = new Map();
  const dynamicRegistrarCalls = [];

  const visitFunction = (node, inheritedShadowed) => {
    const shadowed = new Set(inheritedShadowed);
    if (node.name && ts.isIdentifier(node.name) && importedBindingNames.has(node.name.text)) {
      shadowed.add(node.name.text);
    }
    for (const parameter of node.parameters ?? []) {
      const names = new Set();
      collectBindingNames(parameter.name, names);
      for (const name of names) {
        if (importedBindingNames.has(name)) shadowed.add(name);
      }
    }
    if (node.body) visit(node.body, shadowed);
  };

  const visit = (node, inheritedShadowed) => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    let shadowed = inheritedShadowed;
    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      shadowed = new Set(inheritedShadowed);
      for (const name of collectDirectDeclaredNames(node)) {
        if (importedBindingNames.has(name)) shadowed.add(name);
      }
      for (const statement of node.statements) {
        visit(statement, shadowed);
        if (isDefinitelyAbruptStatement(statement)) break;
      }
      return;
    }
    if (node !== sourceFile && isDeferredFunctionNode(node)) return;

    if (ts.isIfStatement(node)) {
      visit(node.expression, shadowed);
      const condition = readStaticBoolean(node.expression);
      if (condition === true) visit(node.thenStatement, shadowed);
      if (condition === false && node.elseStatement) visit(node.elseStatement, shadowed);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.condition, shadowed);
      const condition = readStaticBoolean(node.condition);
      if (condition === true) visit(node.whenTrue, shadowed);
      if (condition === false) visit(node.whenFalse, shadowed);
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
      if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && condition === true) {
        visit(node.right, shadowed);
      }
      if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken && condition === false) {
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
      ts.isSwitchStatement(node)
    ) {
      return;
    }
    if (ts.isTryStatement(node)) {
      visit(node.tryBlock, shadowed);
      if (node.finallyBlock) visit(node.finallyBlock, shadowed);
      return;
    }

    if (ts.isVariableDeclaration(node) && node.initializer) {
      const specifier = readDynamicImportSpecifier(node.initializer);
      if (specifier) {
        if (ts.isIdentifier(node.name)) {
          dynamicBindings.set(node.name.text, { specifier, imported: '*' });
        } else if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (!ts.isIdentifier(element.name)) continue;
            const imported = element.propertyName
              ? readBindingPropertyName(element.propertyName)
              : element.name.text;
            if (imported) {
              dynamicBindings.set(element.name.text, { specifier, imported });
            }
          }
        }
      }
    }

    if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        dynamicImports.add(node.arguments[0].text);
        return;
      }
      if (ts.isIdentifier(node.expression) && !shadowed.has(node.expression.text)) {
        calledIdentifiers.add(node.expression.text);
      }
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        !shadowed.has(node.expression.expression.text)
      ) {
        calledProperties.add(`${node.expression.expression.text}\0${node.expression.name.text}`);
      }
      const dynamicCall = readDirectDynamicRegistrarCall(node);
      if (dynamicCall) dynamicRegistrarCalls.push(dynamicCall);
      const callee = unwrapExpression(node.expression);
      if (ts.isFunctionExpression(callee) || ts.isArrowFunction(callee)) {
        visitFunction(callee, shadowed);
      }
      if (isSynchronousCollectionIteration(node, synchronousCollections)) {
        for (const argument of node.arguments) {
          if (ts.isFunctionExpression(argument) || ts.isArrowFunction(argument)) {
            visitFunction(argument, shadowed);
          }
        }
      }
      if (isSynchronousSuiteRegistration(node, suiteBindings, testBindings, testNamespaces)) {
        for (const argument of node.arguments) {
          if (ts.isFunctionExpression(argument) || ts.isArrowFunction(argument)) {
            visitFunction(argument, shadowed);
          }
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, shadowed));
  };

  visit(sourceFile, new Set());
  return {
    calledIdentifiers,
    calledProperties,
    dynamicImports: [...dynamicImports],
    dynamicBindings,
    dynamicRegistrarCalls
  };
}

function isSynchronousSuiteRegistration(node, suiteBindings, testBindings, testNamespaces) {
  const expression = node.expression;
  if (isSuiteCallee(expression, suiteBindings, testBindings, testNamespaces)) return true;
  return (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'each' &&
    isSuiteCallee(expression.expression.expression, suiteBindings, testBindings, testNamespaces)
  );
}

function isSuiteCallee(expression, suiteBindings, testBindings, testNamespaces) {
  if (ts.isIdentifier(expression)) return suiteBindings.has(expression.text);
  if (!ts.isPropertyAccessExpression(expression)) return false;
  if (
    ts.isIdentifier(expression.expression) &&
    testNamespaces.has(expression.expression.text) &&
    ['describe', 'suite'].includes(expression.name.text)
  ) {
    return true;
  }
  if (
    expression.name.text === 'describe' &&
    isTestCallee(expression.expression, testBindings, testNamespaces)
  ) {
    return true;
  }
  if (['concurrent', 'only', 'parallel', 'sequential', 'serial'].includes(expression.name.text)) {
    return isSuiteCallee(expression.expression, suiteBindings, testBindings, testNamespaces);
  }
  return false;
}
