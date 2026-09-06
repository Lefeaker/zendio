import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, 'src');

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (/\.(ts|tsx|js|mjs)$/.test(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

// Check the concrete production owners, excluding dormant nested functions. These
// AST contracts tolerate formatting, comments, parentheses and local binding names.
function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node))) {
    node = node.expression;
  }
  return node;
}

function named(node, name) {
  return !!node && ts.isIdentifier(node) && node.text === name;
}

function member(node, owner, name) {
  node = unwrap(node);
  return (
    !!node &&
    ts.isPropertyAccessExpression(node) &&
    named(node.name, name) &&
    owner(node.expression)
  );
}

function call(node, target, argument) {
  node = unwrap(node);
  return (
    !!node &&
    ts.isCallExpression(node) &&
    target(node.expression) &&
    (argument === undefined || (node.arguments.length === 1 && argument(unwrap(node.arguments[0]))))
  );
}

function nodes(root, predicate) {
  const found = [];
  function visit(node) {
    if (predicate(node)) found.push(node);
    if (node !== root && ts.isFunctionLike(node)) return;
    ts.forEachChild(node, visit);
  }
  if (root) visit(root);
  return found;
}

function declarations(block) {
  return (
    block?.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => [...statement.declarationList.declarations]) ?? []
  );
}

function declaration(block, initializer) {
  return declarations(block).find(
    (node) => node.initializer && initializer(unwrap(node.initializer))
  );
}

function returnsStoredOptions(node) {
  return (
    !!node?.type &&
    ts.isTypeReferenceNode(node.type) &&
    named(node.type.typeName, 'Promise') &&
    node.type.typeArguments?.length === 1 &&
    named(node.type.typeArguments[0].typeName, 'StoredOptions')
  );
}

function readonlyPatches(parameter, element) {
  const type = parameter?.type;
  return (
    !!type &&
    ts.isTypeOperatorNode(type) &&
    type.operator === ts.SyntaxKind.ReadonlyKeyword &&
    ts.isArrayTypeNode(type.type) &&
    ts.isTypeReferenceNode(type.type.elementType) &&
    named(type.type.elementType.typeName, element) &&
    ts.isIdentifier(parameter.name)
  );
}

function checkPatchAcknowledgements(sources, findings) {
  const parse = (path) =>
    ts.createSourceFile(path, sources[path] ?? '', ts.ScriptTarget.Latest, true);
  const persistencePath = 'src/options/services/persistence.ts';
  const controllerPath = 'src/options/app/optionsController.ts';
  const storePath = 'src/options/state/optionsStore.ts';
  const persistence = parse(persistencePath);
  const factory = persistence.statements.find(
    (node) => ts.isFunctionDeclaration(node) && named(node.name, 'createChromeOptionsPersistence')
  );
  const object = factory?.body?.statements.find(ts.isReturnStatement)?.expression;
  const save =
    object && ts.isObjectLiteralExpression(object)
      ? object.properties.find((node) => ts.isMethodDeclaration(node) && named(node.name, 'save'))
      : undefined;
  const parameter = save?.parameters[0];
  const storeSave = (node) => member(node, (owner) => named(owner, 'optionsStore'), 'save');
  const forwardsPatches = (node) =>
    call(node, storeSave, (arg) => named(arg, parameter?.name.text));
  const saveReturn = save?.body?.statements.find(ts.isReturnStatement);
  const adopted = unwrap(saveReturn?.expression);
  if (
    !save?.body ||
    !readonlyPatches(parameter, 'OptionsPatch') ||
    !returnsStoredOptions(save) ||
    save.parameters.length !== 1 ||
    save.body.statements.length !== 1 ||
    !(
      forwardsPatches(adopted) ||
      (adopted && ts.isAwaitExpression(adopted) && forwardsPatches(adopted.expression))
    )
  ) {
    findings.push(
      `${persistencePath} save must accept readonly OptionsPatch[] and return the optionsStore.save(patches) Promise/ack`
    );
  }

  // Locate the actual durability callback, not a similarly named helper or comment.
  const controller = parse(controllerPath);
  const constructors = [];
  for (const statement of controller.statements) {
    if (ts.isClassDeclaration(statement))
      constructors.push(...statement.members.filter(ts.isConstructorDeclaration));
  }
  const durability = constructors.flatMap((ctor) =>
    nodes(ctor.body, (node) =>
      call(node, (target) => named(target, 'createOptionsControllerDurability'))
    )
  );
  const config = durability.length === 1 ? durability[0].arguments[0] : undefined;
  const persist =
    config && ts.isObjectLiteralExpression(config)
      ? config.properties.find(
          (node) => ts.isPropertyAssignment(node) && named(node.name, 'persist')
        )?.initializer
      : undefined;
  const callback =
    persist && (ts.isArrowFunction(persist) || ts.isFunctionExpression(persist))
      ? persist
      : undefined;
  const block =
    callback?.body && ts.isBlock(callback.body)
      ? callback.body.statements.find(ts.isTryStatement)?.tryBlock
      : undefined;
  const controllerSave = (node) =>
    member(
      node,
      (owner) =>
        member(owner, (receiver) => receiver.kind === ts.SyntaxKind.ThisKeyword, 'persistence'),
      'save'
    );
  const intentPatches = (node) => member(node, (owner) => named(owner, 'intent'), 'patches');
  const awaited = (node) =>
    !!node && ts.isAwaitExpression(node) && call(node.expression, controllerSave, intentPatches);
  const ack = declaration(block, (node) =>
    call(node, (target) => named(target, 'mergeOptions'), awaited)
  );
  const session = (node) =>
    call(node, (target) =>
      member(target, (owner) => owner.kind === ts.SyntaxKind.ThisKeyword, 'requireDraftSession')
    );
  const acknowledges = nodes(callback?.body, (node) =>
    call(node, (target) => member(target, session, 'acknowledge'))
  );
  const saves = nodes(callback?.body, (node) => call(node, controllerSave));
  const successes = nodes(callback?.body, (node) =>
    call(node, (target) =>
      member(
        target,
        (owner) =>
          member(owner, (receiver) => receiver.kind === ts.SyntaxKind.ThisKeyword, 'callbacks'),
        'onSaveSuccess'
      )
    )
  );
  const transition = declaration(block, (node) => acknowledges.includes(node));
  if (
    !callback ||
    !ack ||
    !ts.isIdentifier(ack.name) ||
    saves.length !== 1 ||
    acknowledges.length !== 1 ||
    !transition ||
    transition.pos < ack.end ||
    acknowledges[0].arguments.length !== 2 ||
    !named(acknowledges[0].arguments[0], 'intent') ||
    !named(acknowledges[0].arguments[1], ack.name.text) ||
    successes.length !== 1 ||
    successes[0].pos < transition.end ||
    !block?.statements.some(
      (statement) =>
        ts.isExpressionStatement(statement) && unwrap(statement.expression) === successes[0]
    )
  ) {
    findings.push(
      `${controllerPath} durability persist must await intent.patches before acknowledging intent and reporting success`
    );
  }

  const store = parse(storePath);
  const storeFunction = store.statements.find(
    (node) => ts.isFunctionDeclaration(node) && named(node.name, 'save')
  );
  const storeBlock = storeFunction?.body;
  const mutation = declaration(storeBlock, (node) =>
    call(
      node,
      (target) => named(target, 'normalizeMutationPatches'),
      (arg) => named(arg, storeFunction?.parameters[0]?.name.text)
    )
  );
  const repositoryPatch = (node) =>
    call(
      node,
      (target) =>
        member(
          target,
          (owner) => call(owner, (getter) => named(getter, 'getOptionsRepository')),
          'patch'
        ),
      (arg) => member(arg, (owner) => named(owner, mutation?.name.text), 'patches')
    );
  const storedAck = declaration(
    storeBlock,
    (node) => ts.isAwaitExpression(node) && repositoryPatch(node.expression)
  );
  const sanitized = declaration(storeBlock, (node) =>
    call(
      node,
      (target) => named(target, 'applySanitizedOptions'),
      (arg) => named(arg, storedAck?.name.text)
    )
  );
  const normalized =
    sanitized && ts.isObjectBindingPattern(sanitized.name)
      ? sanitized.name.elements.find((binding) =>
          named(binding.propertyName ?? binding.name, 'normalized')
        )?.name
      : undefined;
  const returns = nodes(storeBlock, ts.isReturnStatement);
  const patchCalls = nodes(storeBlock, (node) =>
    call(node, (target) =>
      member(
        target,
        (owner) => call(owner, (getter) => named(getter, 'getOptionsRepository')),
        'patch'
      )
    )
  );
  if (
    !storeFunction ||
    !readonlyPatches(storeFunction.parameters[0], 'OptionsStoreInputPatch') ||
    !returnsStoredOptions(storeFunction) ||
    !mutation ||
    !storedAck ||
    !sanitized ||
    !normalized ||
    mutation.end > storedAck.pos ||
    storedAck.end > sanitized.pos ||
    patchCalls.length !== 1 ||
    returns.length !== 1 ||
    !storeBlock.statements.includes(returns[0]) ||
    returns[0].pos < sanitized.end ||
    !call(
      returns[0].expression,
      (target) => named(target, 'cloneStateValue'),
      (arg) => named(arg, normalized.text)
    )
  ) {
    findings.push(
      `${storePath} save must await repository.patch(patches) and return the authoritative sanitized StoredOptions acknowledgement`
    );
  }
}

export function auditOptionsMainline(sources) {
  const findings = [];
  const references = {
    chromeOptionsPersistence: [],
    legacyOptionsRepository: [],
    sectionRegistryImports: []
  };

  for (const [relativePath, source] of Object.entries(sources)) {
    if (/\bchromeOptionsPersistence\b/.test(source)) {
      references.chromeOptionsPersistence.push(relativePath);
    }
    if (
      /\b(?:adaptOptionsRepository|createCompatibilityOptionsRepository|ChromeSyncOptionsRepository|LegacyOptionsRepositoryAdapter)\b/.test(
        source
      )
    ) {
      references.legacyOptionsRepository.push(relativePath);
    }
    if (/from ['"][^'"]*sectionRegistry['"]/.test(source)) {
      references.sectionRegistryImports.push(relativePath);
    }
  }

  const requiredPairs = [
    [
      'src/options/state/optionsStore.ts',
      'resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository)'
    ],
    ['src/options/services/persistence.ts', 'return optionsStore.load();'],
    ['src/options/app/bootstrap.ts', 'persistence: chromeOptionsPersistence']
  ];

  for (const [relativePath, snippet] of requiredPairs) {
    const source = sources[relativePath] ?? '';
    if (!source.includes(snippet)) {
      findings.push(`${relativePath} missing options mainline snippet: ${snippet}`);
    }
  }

  const allowedPersistenceRefs = new Set([
    'src/options/services/persistence.ts',
    'src/options/app/bootstrap.ts'
  ]);
  for (const relativePath of references.chromeOptionsPersistence) {
    if (!allowedPersistenceRefs.has(relativePath)) {
      findings.push(`chromeOptionsPersistence leaked outside bootstrap adapter: ${relativePath}`);
    }
  }

  for (const relativePath of references.legacyOptionsRepository) {
    findings.push(
      `legacy OptionsRepository compatibility leaked into production path: ${relativePath}`
    );
  }

  for (const relativePath of references.sectionRegistryImports) {
    findings.push(
      `sectionRegistry import should stay retired from production flow: ${relativePath}`
    );
  }

  for (const [relativePath, source] of Object.entries(sources)) {
    if (!relativePath.startsWith('src/options/components/sections/')) continue;
    if (/optionsRepo\s*\.?\s*set\s*\(/.test(source)) {
      findings.push(`section must not write optionsRepo directly: ${relativePath}`);
    }
  }

  checkPatchAcknowledgements(sources, findings);
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sources = Object.fromEntries(
    walk(SRC_ROOT).map((path) => [relative(ROOT, path), readFileSync(path, 'utf8')])
  );
  const findings = auditOptionsMainline(sources);
  if (findings.length > 0) {
    console.error('Options mainline audit failed:\n');
    findings.forEach((finding) => console.error(`- ${finding}`));
    process.exitCode = 1;
  } else {
    console.log('Options mainline audit passed.');
  }
}
