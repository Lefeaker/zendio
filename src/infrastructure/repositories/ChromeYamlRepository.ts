import type { IYamlRepository, IOptionsRepository } from '../../shared/repositories';
import type { YamlConfigOverrides } from '../../shared/types/yamlConfig';
import type { CompleteOptions } from '../../shared/types/options';
import { RepositoryError } from '../../shared/errors/repositoryErrors';

const clone = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const serialize = (value: YamlConfigOverrides | null): string => JSON.stringify(value ?? null);

export class ChromeYamlRepository implements IYamlRepository {
  private readonly listeners = new Set<(overrides: YamlConfigOverrides | null) => void>();
  private unsubscribeOptions: (() => void) | null = null;
  private lastSerialized: string | null = null;

  constructor(private readonly optionsRepository: IOptionsRepository) {}

  private ensureSubscription(): void {
    if (this.unsubscribeOptions) {
      return;
    }
    this.unsubscribeOptions = this.optionsRepository.onChange((options) => {
      this.emitIfChanged(options);
    });
  }

  private emitIfChanged(options: CompleteOptions): void {
    const overrides = options.yamlConfig ?? null;
    const serialized = serialize(overrides);
    if (serialized === this.lastSerialized) {
      return;
    }
    this.lastSerialized = serialized;
    const snapshot = overrides ? clone(overrides) : null;
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('[ChromeYamlRepository] onChange callback error:', error);
      }
    });
  }

  async getOverrides(): Promise<YamlConfigOverrides | null> {
    const options = await this.optionsRepository.get();
    return options.yamlConfig ? clone(options.yamlConfig) : null;
  }

  async setOverrides(overrides: YamlConfigOverrides): Promise<void> {
    try {
      await this.optionsRepository.set({ yamlConfig: clone(overrides) });
    } catch (error) {
      throw new RepositoryError('Failed to save YAML overrides', 'YamlRepositoryError', { cause: error });
    }
  }

  onChange(callback: (overrides: YamlConfigOverrides | null) => void): () => void {
    this.ensureSubscription();
    void this.optionsRepository
      .get()
      .then((options) => {
        this.lastSerialized = serialize(options.yamlConfig ?? null);
        callback(options.yamlConfig ? clone(options.yamlConfig) : null);
      })
      .catch((error) => {
        console.error('[ChromeYamlRepository] Failed to emit initial overrides:', error);
      });

    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
      if (!this.listeners.size && this.unsubscribeOptions) {
        this.unsubscribeOptions();
        this.unsubscribeOptions = null;
      }
    };
  }
}
