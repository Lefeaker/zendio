import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  auditOptionsMainline,
  auditOptionsSectionSource
} from '../../../tools/report-options-mainline.mjs';

const persistencePath = 'src/options/services/persistence.ts';
const controllerPath = 'src/options/app/optionsController.ts';
const storePath = 'src/options/state/optionsStore.ts';
const paths = [persistencePath, controllerPath, storePath, 'src/options/app/bootstrap.ts'];

function productionSources(): Record<string, string> {
  return Object.fromEntries(paths.map((path) => [path, readFileSync(path, 'utf8')]));
}

function sourceAt(sources: Record<string, string>, path: string): string {
  const source = sources[path];
  if (source === undefined) throw new Error(`Missing fixture source: ${path}`);
  return source;
}

// Bind each fault to current production text so a moved owner cannot silently evade the test.
function mutate(path: string, before: string, after: string): string[] {
  const sources = productionSources();
  expect(sources[path]).toContain(before);
  sources[path] = sourceAt(sources, path).replace(before, after);
  return auditOptionsMainline(sources);
}

describe('report-options-mainline', () => {
  it('accepts the current production patch/ack owners', () => {
    expect(auditOptionsMainline(productionSources())).toEqual([]);
  });

  it('accepts parenthesized, commented and multiline Promise adoption', () => {
    expect(
      mutate(
        persistencePath,
        'return optionsStore.save(patches);',
        'return (await optionsStore /* forwarding */ .save(\n(patches)\n));'
      )
    ).toEqual([]);
  });

  it('accepts renamed local acknowledgement bindings', () => {
    const sources = productionSources();
    sources[controllerPath] = sourceAt(sources, controllerPath).replaceAll(
      'acknowledged',
      'durableSnapshot'
    );
    sources[storePath] = sourceAt(sources, storePath).replaceAll('acknowledged', 'durableSnapshot');
    expect(auditOptionsMainline(sources)).toEqual([]);
  });

  it('rejects a controller save without await', () => {
    expect(
      mutate(
        controllerPath,
        'await this.persistence.save(intent.patches)',
        'this.persistence.save(intent.patches)'
      )
    ).toContainEqual(expect.stringContaining('durability persist must await'));
  });

  it('does not accept a comment containing the required await expression', () => {
    expect(
      mutate(
        controllerPath,
        'await this.persistence.save(intent.patches)',
        '/* await this.persistence.save(intent.patches) */ this.persistence.save(intent.patches)'
      )
    ).toContainEqual(expect.stringContaining('durability persist must await'));
  });

  it('rejects acknowledgement before the awaited save', () => {
    expect(
      mutate(
        controllerPath,
        'const acknowledged = mergeOptions(await this.persistence.save(intent.patches));\n          const transition = this.requireDraftSession().acknowledge(intent, acknowledged);',
        'const transition = this.requireDraftSession().acknowledge(intent, acknowledged);\n          const acknowledged = mergeOptions(await this.persistence.save(intent.patches));'
      )
    ).toContainEqual(expect.stringContaining('durability persist must await'));
  });

  it('rejects early success even when a later success remains', () => {
    expect(
      mutate(
        controllerPath,
        'this.requireDraftSession().admit(intent);',
        'this.requireDraftSession().admit(intent);\n this.callbacks.onSaveSuccess?.(reason, {});'
      )
    ).toContainEqual(expect.stringContaining('durability persist must await'));
  });

  it('rejects passing the wrong snapshot to intent acknowledgement', () => {
    expect(
      mutate(
        controllerPath,
        '.acknowledge(intent, acknowledged)',
        '.acknowledge(intent, this.snapshot)'
      )
    ).toContainEqual(expect.stringContaining('durability persist must await'));
  });

  it('rejects a string literal masquerading as the patches binding', () => {
    expect(
      mutate(
        persistencePath,
        'return optionsStore.save(patches);',
        "return optionsStore.save('patches');"
      )
    ).toContainEqual(expect.stringContaining('return the optionsStore.save(patches) Promise/ack'));
  });

  it('rejects a detached persistence Promise', () => {
    expect(
      mutate(
        persistencePath,
        'return optionsStore.save(patches);',
        'optionsStore.save(patches); return {} as StoredOptions;'
      )
    ).toContainEqual(expect.stringContaining('return the optionsStore.save(patches) Promise/ack'));
  });

  it('rejects awaiting and discarding the persistence acknowledgement', () => {
    expect(
      mutate(
        persistencePath,
        'return optionsStore.save(patches);',
        'await optionsStore.save(patches); return {} as StoredOptions;'
      )
    ).toContainEqual(expect.stringContaining('return the optionsStore.save(patches) Promise/ack'));
  });

  it('rejects an obsolete whole-draft save even with the former magic snippet', () => {
    const sources = productionSources();
    sources[persistencePath] = sourceAt(sources, persistencePath)
      .replaceAll('save(patches: readonly OptionsPatch[])', 'save(draft: CompleteOptions)')
      .replace(
        'return optionsStore.save(patches);',
        'await optionsStore.save(draft); return draft;'
      );
    expect(auditOptionsMainline(sources)).toContainEqual(
      expect.stringContaining('accept readonly OptionsPatch[]')
    );
  });

  it('rejects a missing repository.patch await', () => {
    expect(
      mutate(
        storePath,
        'const acknowledged = await getOptionsRepository().patch(mutation.patches);',
        'const acknowledged = getOptionsRepository().patch(mutation.patches);'
      )
    ).toContainEqual(
      expect.stringContaining('authoritative sanitized StoredOptions acknowledgement')
    );
  });

  it('rejects a missing store acknowledgement return', () => {
    expect(
      mutate(
        storePath,
        "if (mutation.changed) registerYamlMigration('mutation input');\n  return cloneStateValue(normalized);",
        "if (mutation.changed) registerYamlMigration('mutation input');"
      )
    ).toContainEqual(
      expect.stringContaining('authoritative sanitized StoredOptions acknowledgement')
    );
  });

  it('rejects returning the cache instead of the acknowledged snapshot', () => {
    expect(
      mutate(
        storePath,
        "if (mutation.changed) registerYamlMigration('mutation input');\n  return cloneStateValue(normalized);",
        "if (mutation.changed) registerYamlMigration('mutation input');\n return cachedSnapshot;"
      )
    ).toContainEqual(
      expect.stringContaining('authoritative sanitized StoredOptions acknowledgement')
    );
  });

  it('rejects normalization of input rather than the repository acknowledgement', () => {
    expect(
      mutate(storePath, 'applySanitizedOptions(acknowledged)', 'applySanitizedOptions(patches)')
    ).toContainEqual(
      expect.stringContaining('authoritative sanitized StoredOptions acknowledgement')
    );
  });

  it('rejects a dormant helper pretending to await controller persistence', () => {
    expect(
      mutate(
        controllerPath,
        'const acknowledged = mergeOptions(await this.persistence.save(intent.patches));',
        'const unused = async () => { const acknowledged = mergeOptions(await this.persistence.save(intent.patches)); };\n const acknowledged = this.snapshot;'
      )
    ).toContainEqual(expect.stringContaining('durability persist must await'));
  });

  it('retains retired repository, registry and adapter authority gates', () => {
    const sources = productionSources();
    const retiredPath = ['src/infrastructure', 'optionsRepository.ts'].join('/');
    sources[retiredPath] = 'export class ChromeSyncOptionsRepository {}';
    sources['src/options/authorityLeak.ts'] =
      "import { value } from './sectionRegistry'; chromeOptionsPersistence;";
    const findings = auditOptionsMainline(sources);
    expect(findings).toContainEqual(
      expect.stringContaining(`compatibility leaked into production path: ${retiredPath}`)
    );
    expect(findings).toContainEqual(
      expect.stringContaining('sectionRegistry import should stay retired')
    );
    expect(findings).toContainEqual(
      expect.stringContaining('chromeOptionsPersistence leaked outside bootstrap adapter')
    );
  });

  it('rejects direct section writes through the production source rule', () => {
    expect(auditOptionsSectionSource('optionsRepo.set({});')).toContain(
      'section must not write optionsRepo directly'
    );
    expect(auditOptionsSectionSource('optionsRepo \n . set({});')).toContain(
      'section must not write optionsRepo directly'
    );
  });

  it('accepts section source that delegates saving through its controller', () => {
    expect(auditOptionsSectionSource('await controller.save();')).toEqual([]);
  });

  it('does not allowlist the retired legacy OptionsRepository source path', () => {
    const source = readFileSync('tools/report-options-mainline.mjs', 'utf8');
    expect(source).not.toContain(['src/infrastructure', 'optionsRepository.ts'].join('/'));
  });
});
