import type { z } from 'zod';
import { DEFAULT_OPTIONS } from '../../../src/shared/config/defaultOptions';
import { mergeOptions } from '../../../src/shared/config/optionsMerger';
import type { IOptionsRepository } from '../../../src/shared/repositories/IOptionsRepository';
import {
  CompleteOptionsSchema,
  StoredOptionsSchema
} from '../../../src/shared/schemas/options.schema';
import { TaxonomyConfigSchema } from '../../../src/shared/schemas/taxonomy.schema';
import type { CompleteOptions, StoredOptions } from '../../../src/shared/types/options';
import type { TaxonomyConfig } from '../../../src/shared/types/taxonomy';
import type {
  OptionsMutationCommand,
  OptionsMutationSuccessResult
} from '../../../src/shared/types/optionsMutationMessages';

type Equal<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2
    ? true
    : false;
type Assert<Condition extends true> = Condition;
type IsRequired<Type, Key extends keyof Type> = {} extends Pick<Type, Key> ? false : true;

type StoredSchemaContract = Assert<Equal<StoredOptions, z.infer<typeof StoredOptionsSchema>>>;
type CompleteSchemaContract = Assert<Equal<CompleteOptions, z.infer<typeof CompleteOptionsSchema>>>;
type TaxonomySchemaContract = Assert<Equal<TaxonomyConfig, z.infer<typeof TaxonomyConfigSchema>>>;
type ClosedStoredRootContract = Assert<
  Equal<string extends keyof StoredOptions ? true : false, false>
>;
type CompleteAssignableToStoredContract = Assert<
  Equal<CompleteOptions extends StoredOptions ? true : false, true>
>;
type RequiredPrivacyContract = Assert<
  Equal<IsRequired<CompleteOptions, 'privacyPreferences'>, true>
>;
type ClassifierTimeoutContract = Assert<
  Equal<CompleteOptions['classifier']['timeoutMs'], number | undefined>
>;
type CompleteVaultContract = Assert<
  Equal<CompleteOptions['vaultRouter'], z.infer<typeof CompleteOptionsSchema>['vaultRouter']>
>;
type CompleteYamlContract = Assert<
  Equal<CompleteOptions['yamlConfig'], z.infer<typeof CompleteOptionsSchema>['yamlConfig']>
>;
type DefaultOptionsContract = Assert<Equal<typeof DEFAULT_OPTIONS, CompleteOptions>>;
type MergerContract = Assert<Equal<ReturnType<typeof mergeOptions>, CompleteOptions>>;
type RepositoryContract = Assert<
  Equal<Awaited<ReturnType<IOptionsRepository['get']>>, CompleteOptions>
>;
type MessageSnapshotContract = Assert<
  Equal<OptionsMutationSuccessResult['snapshot'], CompleteOptions>
>;
type MessageReplacementContract = Assert<
  Equal<Extract<OptionsMutationCommand, { kind: 'replace' }>['replacement'], StoredOptions>
>;

type PersistedFixture = {
  interfaceTheme: 'system';
  rest: { apiKey: '' };
  classifier: { timeoutMs: 15_000 };
  vaultRouter: { vaults: [] };
  yamlConfig: { contentTypes: { article: { fields: [] } } };
};
type PersistedFixtureContract = Assert<
  Equal<PersistedFixture extends StoredOptions ? true : false, true>
>;

type CompleteFixture = typeof DEFAULT_OPTIONS & {
  classifier: typeof DEFAULT_OPTIONS.classifier & { timeoutMs: 15_000 };
  vaultRouter: { vaults: [] };
  yamlConfig: null;
};
type CompleteFixtureContract = Assert<
  Equal<CompleteFixture extends CompleteOptions ? true : false, true>
>;

export type OptionsTypeContractAssertions = [
  StoredSchemaContract,
  CompleteSchemaContract,
  TaxonomySchemaContract,
  ClosedStoredRootContract,
  CompleteAssignableToStoredContract,
  RequiredPrivacyContract,
  ClassifierTimeoutContract,
  CompleteVaultContract,
  CompleteYamlContract,
  DefaultOptionsContract,
  MergerContract,
  RepositoryContract,
  MessageSnapshotContract,
  MessageReplacementContract,
  PersistedFixtureContract,
  CompleteFixtureContract
];
