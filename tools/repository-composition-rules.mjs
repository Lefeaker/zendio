import ts from 'typescript';

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)))
    node = node.expression;
  return node;
}
function named(node, name) {
  node = unwrap(node);
  return !!node && ts.isIdentifier(node) && node.text === name;
}
function member(node, owner, name) {
  node = unwrap(node);
  return (
    !!node &&
    ts.isPropertyAccessExpression(node) &&
    named(node.expression, owner) &&
    named(node.name, name)
  );
}
function call(node, name) {
  node = unwrap(node);
  return !!node && ts.isCallExpression(node) && named(node.expression, name);
}
function statements(block) {
  return block?.statements ?? [];
}
function declarations(block) {
  return statements(block)
    .filter(ts.isVariableStatement)
    .flatMap((s) => [...s.declarationList.declarations]);
}
function expressions(block) {
  return statements(block)
    .filter(ts.isExpressionStatement)
    .map((s) => unwrap(s.expression));
}
function binding(source, module, imported) {
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.moduleSpecifier.text !== module ||
      statement.importClause?.isTypeOnly
    )
      continue;
    const names = statement.importClause?.namedBindings;
    if (!names || !ts.isNamedImports(names)) continue;
    const element = names.elements.find(
      (e) => !e.isTypeOnly && (e.propertyName ?? e.name).text === imported
    );
    if (element) return element.name.text;
  }
}
function owner(source, name) {
  return source.statements.find(
    (s) =>
      ts.isFunctionDeclaration(s) &&
      named(s.name, name) &&
      s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}
function property(object, name) {
  object = unwrap(object);
  if (!object || !ts.isObjectLiteralExpression(object)) return;
  const matches = object.properties.filter((p) => named(p.name, name));
  if (matches.length !== 1) return;
  const p = matches[0];
  return ts.isPropertyAssignment(p)
    ? unwrap(p.initializer)
    : ts.isShorthandPropertyAssignment(p)
      ? p.name
      : undefined;
}
function calls(root, name) {
  const found = [];
  function visit(node) {
    if (call(node, name)) found.push(node);
    if (node !== root && ts.isFunctionLike(node)) return;
    ts.forEachChild(node, visit);
  }
  if (root) visit(root);
  return found;
}
// Start at the owner function so enclosing parameters and their binding patterns
// are checked along with declarations in its body.
function localBindings(root, name) {
  const found = [];
  function bound(node) {
    if (ts.isIdentifier(node)) {
      if (node.text === name) found.push(node);
    } else if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) {
      for (const element of node.elements) if (ts.isBindingElement(element)) bound(element.name);
    }
  }
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node)
    ) {
      if (node.name) bound(node.name);
    }
    ts.forEachChild(node, visit);
  }
  if (root) visit(root);
  return found;
}
function missingServicesGuard(node, services, storage) {
  if (!node || !ts.isIfStatement(node) || node.elseStatement) return false;
  const condition = unwrap(node.expression);
  const negates = (value, name) =>
    value &&
    ts.isPrefixUnaryExpression(value) &&
    value.operator === ts.SyntaxKind.ExclamationToken &&
    named(value.operand, name);
  return (
    ts.isBinaryExpression(condition) &&
    condition.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
    negates(unwrap(condition.left), services) &&
    negates(unwrap(condition.right), storage) &&
    statements(node.thenStatement).length === 1 &&
    ts.isThrowStatement(node.thenStatement.statements[0])
  );
}
function assignment(node, target, receiver, field) {
  return (
    !!node &&
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    named(node.left, target) &&
    member(node.right, receiver, field)
  );
}
function chromeGuard(node) {
  node = unwrap(node);
  if (!node) return false;
  const terms = [];
  function split(n) {
    n = unwrap(n);
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      split(n.left);
      split(n.right);
    } else terms.push(n);
  }
  split(node);
  const defined = terms.some(
    (n) =>
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken &&
      ts.isTypeOfExpression(n.left) &&
      named(n.left.expression, 'chrome') &&
      ts.isStringLiteral(n.right) &&
      n.right.text === 'undefined'
  );
  const available = (field) =>
    terms.some(
      (n) =>
        call(n, 'Boolean') &&
        n.arguments.length === 1 &&
        (field === 'runtime'
          ? member(n.arguments[0], 'chrome', field)
          : ts.isPropertyAccessExpression(unwrap(n.arguments[0])) &&
            named(unwrap(n.arguments[0]).name, field) &&
            member(unwrap(n.arguments[0]).expression, 'chrome', 'storage'))
    );
  return terms.length === 4 && defined && ['runtime', 'sync', 'local'].every(available);
}

// Static ownership contracts over actual caller bodies, not comments or dormant helpers.
// The caller supplies source text so tests can mutate current production inputs in memory.
export function auditOptionsRepositoryComposition(runtimeSource, previewSource) {
  const runtime = ts.createSourceFile(
    'runtimeEntry.ts',
    runtimeSource,
    ts.ScriptTarget.Latest,
    true
  );
  const preview = ts.createSourceFile(
    'optionsRepository.ts',
    previewSource,
    ts.ScriptTarget.Latest,
    true
  );
  const findings = [];
  const check = (ok, message) => {
    if (!ok) findings.push(message);
  };
  check(
    runtime.parseDiagnostics.length === 0 && preview.parseDiagnostics.length === 0,
    'Options composition sources must parse as TypeScript'
  );
  const boot = owner(runtime, 'bootstrapOptionsRuntime');
  const body = boot?.body;
  const services = boot?.parameters[0]?.name.text;
  const guard = declarations(body).find((d) => chromeGuard(d.initializer));
  const branch = statements(body).find(
    (s) => ts.isIfStatement(s) && named(s.expression, guard?.name.text)
  );
  const production = branch?.thenStatement;
  const offline = branch?.elseStatement;
  const register = binding(runtime, '@shared/di/serviceRegistry', 'registerRepositories');
  const registrations = calls(body, register);
  const registration = expressions(production).find((e) => call(e, register));
  const config = unwrap(registration?.arguments[0]);
  check(
    !!services &&
      !!guard &&
      !!branch &&
      !!production &&
      ts.isBlock(production) &&
      !!offline &&
      ts.isBlock(offline),
    'Options runtime must select Chrome storage and preview branches in bootstrapOptionsRuntime'
  );
  check(
    !!register &&
      registrations.length === 1 &&
      !!registration &&
      registration.arguments.length === 1 &&
      !!config &&
      ts.isObjectLiteralExpression(config) &&
      config.properties.length === 4 &&
      ['storage', 'messaging', 'tabs', 'runtime'].every((k) =>
        member(property(config, k), services, k)
      ),
    'Chrome branch must registerRepositories once with the supplied platform service fields'
  );

  const previewImport = declarations(offline).find((d) => {
    const awaited = unwrap(d.initializer);
    const expression =
      awaited && ts.isAwaitExpression(awaited) ? unwrap(awaited.expression) : undefined;
    return (
      expression &&
      ts.isCallExpression(expression) &&
      expression.expression.kind === ts.SyntaxKind.ImportKeyword &&
      expression.arguments.length === 1 &&
      ts.isStringLiteral(expression.arguments[0]) &&
      expression.arguments[0].text === '@platform/preview/optionsRepository'
    );
  });
  const imported =
    previewImport && ts.isObjectBindingPattern(previewImport.name)
      ? previewImport.name.elements.find(
          (e) => (e.propertyName ?? e.name).text === 'configurePreviewOptionsRuntime'
        )?.name.text
      : undefined;
  const configured = declarations(offline).find(
    (d) => call(d.initializer, imported) && unwrap(d.initializer).arguments.length === 0
  );
  const storage = declarations(body).find((d) => member(d.initializer, services, 'storage'))?.name
    .text;
  const runtimeName = declarations(body).find((d) => member(d.initializer, services, 'runtime'))
    ?.name.text;
  const writes = expressions(offline);
  check(
    !!imported &&
      !!configured &&
      configured.pos > previewImport.end &&
      calls(body, imported).length === 1 &&
      !!storage &&
      !!runtimeName &&
      writes.length === 2 &&
      writes.every((w) => w.pos >= configured.end) &&
      writes.some((w) => assignment(w, storage, configured.name.text, 'storage')) &&
      writes.some((w) => assignment(w, runtimeName, configured.name.text, 'runtime')),
    'Preview branch must await the preview owner import, configure it once, and forward its storage/runtime'
  );
  check(
    calls(body, 'registerFallbackRepositories').length === 0 &&
      !binding(runtime, '@shared/di/serviceRegistry', 'registerFallbackRepositories'),
    'Options runtime must not replace preview composition with legacy fallback registration'
  );

  const storageOwner = binding(
    runtime,
    '@options/app/bootstrap',
    'configureOptionsAppBootstrapStorage'
  );
  const appOwner = binding(runtime, '@options/app/bootstrap', 'bootstrapOptionsApp');
  const configure = expressions(body).find((e) => call(e, storageOwner));
  const start = expressions(body).find(
    (e) => ts.isAwaitExpression(e) && call(e.expression, appOwner)
  );
  const appConfig = unwrap(start?.expression.arguments[0]);
  const spreads =
    appConfig && ts.isObjectLiteralExpression(appConfig)
      ? appConfig.properties.filter(ts.isSpreadAssignment)
      : [];
  const runtimeSpread = spreads.length === 1 ? unwrap(spreads[0].expression) : undefined;
  check(
    !!storageOwner &&
      !!appOwner &&
      !!configure &&
      !!start &&
      !!branch &&
      configure.pos >= branch.end &&
      start.pos >= configure.end &&
      calls(body, storageOwner).length === 1 &&
      calls(body, appOwner).length === 1 &&
      configure.arguments.length === 1 &&
      named(configure.arguments[0], storage) &&
      named(property(appConfig, 'storage'), storage) &&
      appConfig.properties.length === 3 &&
      !!property(appConfig, 'usageStatsClient') &&
      !!runtimeSpread &&
      ts.isConditionalExpression(runtimeSpread) &&
      named(runtimeSpread.condition, runtimeName) &&
      named(property(runtimeSpread.whenTrue, 'runtime'), runtimeName) &&
      ts.isObjectLiteralExpression(unwrap(runtimeSpread.whenFalse)) &&
      unwrap(runtimeSpread.whenFalse).properties.length === 0,
    'Options bootstrap must receive branch-selected storage/runtime after repository composition'
  );

  // Keep the concrete composition path straight-line: declarations, one branch,
  // storage configuration, then awaited bootstrap. Extra returns or writes cannot
  // be hidden behind later valid-looking owner calls.
  const flow = statements(body).filter((s) => !ts.isVariableStatement(s));
  const productionFlow = statements(production);
  const serviceGuard = productionFlow[0];
  check(
    flow.length === 3 &&
      flow[0] === branch &&
      unwrap(flow[1]?.expression) === configure &&
      unwrap(flow[2]?.expression) === start &&
      declarations(body).every((d) => d.end <= branch?.pos) &&
      productionFlow.length === 3 &&
      missingServicesGuard(serviceGuard, services, storage) &&
      unwrap(productionFlow[1]?.expression) === registration &&
      ts.isExpressionStatement(productionFlow[2]) &&
      ts.isBinaryExpression(unwrap(productionFlow[2].expression)) &&
      named(unwrap(productionFlow[2].expression).left, 'usageStatsClient') &&
      statements(offline).length === 4,
    'Options composition must reach registration and bootstrap without early exits or intervening writes'
  );
  check(
    [register, storageOwner, appOwner].every(
      (name) => !!name && localBindings(boot, name).length === 0
    ) &&
      !!imported &&
      localBindings(boot, imported).length === 1,
    'Options composition must call imported owners without local shadow bindings'
  );

  const factory = owner(preview, 'configurePreviewOptionsRuntime');
  const factoryBody = factory?.body;
  const createServices = binding(preview, './services', 'createPreviewPlatformServices');
  const created = declarations(factoryBody).find(
    (d) => call(d.initializer, createServices) && unwrap(d.initializer).arguments.length === 0
  );
  const registerService = binding(preview, '../../shared/di', 'registerService');
  const tokens = binding(preview, '../../shared/di', 'TOKENS');
  const fallback = binding(
    preview,
    '../../shared/di/serviceRegistry',
    'registerFallbackRepositories'
  );
  const container = binding(preview, '../../shared/di/serviceRegistry', 'repositoryContainer');
  const diTokens = binding(preview, '../../shared/di/tokens', 'DI_TOKENS');
  const actions = expressions(factoryBody);
  const platform = actions.find((e) => call(e, registerService));
  const provider = platform?.arguments[1];
  const fallbackCall = actions.find((e) => call(e, fallback));
  const repository = actions.find(
    (e) => ts.isCallExpression(e) && member(e.expression, container, 'registerSingleton')
  );
  const returned = statements(factoryBody).find(ts.isReturnStatement);
  check(
    !!createServices &&
      !!created &&
      !!registerService &&
      !!tokens &&
      !!platform &&
      platform.arguments.length === 2 &&
      member(platform.arguments[0], tokens, 'platformServices') &&
      !!provider &&
      ts.isArrowFunction(provider) &&
      named(provider.body, created.name.text) &&
      !!fallback &&
      !!fallbackCall &&
      fallbackCall.arguments.length === 0 &&
      !!container &&
      !!diTokens &&
      !!repository &&
      repository.arguments.length === 2 &&
      member(repository.arguments[0], diTokens, 'IOptionsRepository') &&
      named(repository.arguments[1], 'createPreviewOptionsRepository') &&
      !!owner(preview, 'createPreviewOptionsRepository') &&
      !!returned &&
      named(returned.expression, created.name.text) &&
      statements(factoryBody).length === 5 &&
      created.end <= platform.pos &&
      platform.end <= fallbackCall.pos &&
      fallbackCall.end <= repository.pos &&
      repository.end <= returned.pos,
    'Preview owner must install platform services, fallback repositories, then its Options repository before returning those services'
  );
  check(
    [
      createServices,
      registerService,
      tokens,
      fallback,
      container,
      diTokens,
      'createPreviewOptionsRepository'
    ].every((name) => !!name && localBindings(factory, name).length === 0),
    'Preview composition must use its imported and exported owners without local shadow bindings'
  );
  return findings;
}
