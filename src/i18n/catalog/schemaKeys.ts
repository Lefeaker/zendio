import { RUNTIME_MESSAGE_KEYS, type RuntimeMessageKey } from './keys';

export type SchemaMessageKey = Extract<RuntimeMessageKey, `schema${string}`>;

export const SCHEMA_MESSAGE_KEYS = Object.freeze(
  RUNTIME_MESSAGE_KEYS.filter((key) => key.startsWith('schema')) as SchemaMessageKey[]
);

const SCHEMA_MESSAGE_KEY_SET = new Set<string>(SCHEMA_MESSAGE_KEYS);

export function isSchemaMessageKey(value: string): value is SchemaMessageKey {
  return SCHEMA_MESSAGE_KEY_SET.has(value);
}
