/**
 * Configuration service with Result-based error handling.
 * 
 * This service demonstrates the use of Result types for safe
 * configuration management operations.
 */

import type { OptionsState, StoredOptions } from '../../shared/types';
import type { StorageService } from '../../platform/interfaces/storage';
import { mergeOptions } from '../../shared/config/optionsMerger';
import { DEFAULT_OPTIONS } from '../../shared/config';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import {
  type ServiceResult,
  wrapServiceCall,
  mapStorageError,
  serviceSuccess,
  serviceFailure,
  createValidationError,
  createConfigurationError,
  logServiceResult
} from './serviceResult';

const CONFIG_STORAGE_KEY = 'options';

// Configuration service interface
export interface ConfigService {
  getConfig(): Promise<ServiceResult<OptionsState>>;
  updateConfig(updates: Partial<StoredOptions>): Promise<ServiceResult<OptionsState>>;
  resetConfig(): Promise<ServiceResult<OptionsState>>;
  validateConfig(config: unknown): ServiceResult<OptionsState>;
}

// Configuration validation
function isValidStoredOptions(value: unknown): value is StoredOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    // Add more specific validation as needed
    true
  );
}

function validateConfigStructure(config: unknown): ServiceResult<StoredOptions> {
  if (!isValidStoredOptions(config)) {
    return serviceFailure(createValidationError(
      'Invalid configuration structure',
      { received: typeof config }
    ));
  }
  
  // Additional validation can be added here
  return serviceSuccess(config);
}

// Configuration service implementation
class ConfigServiceImpl implements ConfigService {
  constructor(private readonly storage: StorageService) {}

  async getConfig(): Promise<ServiceResult<OptionsState>> {
    return logServiceResult(
      await wrapServiceCall(async () => {
        const stored = await this.storage.local.get<StoredOptions>(CONFIG_STORAGE_KEY);
        
        if (!stored) {
          return DEFAULT_OPTIONS;
        }
        
        const validationResult = validateConfigStructure(stored);
        if (!validationResult.success) {
          const errorMessage = 'error' in validationResult ? validationResult.error.message : 'Unknown validation error';
          throw new Error(`Configuration validation failed: ${errorMessage}`);
        }

        return mergeOptions(validationResult.data);
      }, mapStorageError),
      'ConfigService.getConfig'
    );
  }
  
  async updateConfig(updates: Partial<StoredOptions>): Promise<ServiceResult<OptionsState>> {
    return logServiceResult(
      await wrapServiceCall(async () => {
        // Get current config
        const currentResult = await this.getConfig();
        if (!currentResult.success) {
          const errorMessage = 'error' in currentResult ? currentResult.error.message : 'Unknown error';
          throw new Error(`Failed to get current config: ${errorMessage}`);
        }

        // Validate updates
        const validationResult = validateConfigStructure(updates);
        if (!validationResult.success) {
          const errorMessage = 'error' in validationResult ? validationResult.error.message : 'Unknown validation error';
          throw new Error(`Update validation failed: ${errorMessage}`);
        }

        // Get current stored options
        const currentStored = await this.storage.local.get<StoredOptions>(CONFIG_STORAGE_KEY) || {};
        
        // Merge updates
        const mergedStored = { ...currentStored, ...updates };
        
        // Save merged config
        await this.storage.local.set(CONFIG_STORAGE_KEY, mergedStored);
        
        // Return merged options
        return mergeOptions(mergedStored);
      }, mapStorageError),
      'ConfigService.updateConfig'
    );
  }
  
  async resetConfig(): Promise<ServiceResult<OptionsState>> {
    return logServiceResult(
      await wrapServiceCall(async () => {
        await this.storage.local.remove(CONFIG_STORAGE_KEY);
        return DEFAULT_OPTIONS;
      }, mapStorageError),
      'ConfigService.resetConfig'
    );
  }
  
  validateConfig(config: unknown): ServiceResult<OptionsState> {
    const validationResult = validateConfigStructure(config);
    if (!validationResult.success) {
      return validationResult as ServiceResult<OptionsState>;
    }
    
    try {
      const merged = mergeOptions(validationResult.data);
      return serviceSuccess(merged);
    } catch (error) {
      return serviceFailure(createConfigurationError(
        'Failed to merge configuration',
        { error: error instanceof Error ? error.message : String(error) }
      ));
    }
  }
}

// Service instance
let configServiceInstance: ConfigService | null = null;

export function createConfigService(storage: StorageService): ConfigService {
  return new ConfigServiceImpl(storage);
}

export function getConfigService(): ConfigService {
  if (!configServiceInstance) {
    const platform = getService<PlatformServices>(TOKENS.platformServices);
    configServiceInstance = createConfigService(platform.storage);
  }
  return configServiceInstance;
}

// Convenience functions with Result types
export async function getCurrentConfig(): Promise<ServiceResult<OptionsState>> {
  return getConfigService().getConfig();
}

export async function updateConfiguration(updates: Partial<StoredOptions>): Promise<ServiceResult<OptionsState>> {
  return getConfigService().updateConfig(updates);
}

export async function resetConfiguration(): Promise<ServiceResult<OptionsState>> {
  return getConfigService().resetConfig();
}

export function validateConfiguration(config: unknown): ServiceResult<OptionsState> {
  return getConfigService().validateConfig(config);
}

// Configuration change events (for future use)
export interface ConfigChangeEvent {
  readonly type: 'config_changed';
  readonly previous: OptionsState;
  readonly current: OptionsState;
  readonly changes: Partial<StoredOptions>;
  readonly timestamp: number;
}

// Event handling (placeholder for future implementation)
export type ConfigChangeListener = (event: ConfigChangeEvent) => void;

const configChangeListeners = new Set<ConfigChangeListener>();

export function addConfigChangeListener(listener: ConfigChangeListener): () => void {
  configChangeListeners.add(listener);
  return () => configChangeListeners.delete(listener);
}

function notifyConfigChange(event: ConfigChangeEvent): void {
  configChangeListeners.forEach(listener => {
    try {
      listener(event);
    } catch (error) {
      console.error('Error in config change listener:', error);
    }
  });
}

// Enhanced update function with change notification
export async function updateConfigurationWithNotification(
  updates: Partial<StoredOptions>
): Promise<ServiceResult<OptionsState>> {
  const previousResult = await getCurrentConfig();
  if (!previousResult.success) {
    return previousResult;
  }
  
  const updateResult = await updateConfiguration(updates);
  if (!updateResult.success) {
    return updateResult;
  }
  
  // Notify listeners of the change
  notifyConfigChange({
    type: 'config_changed',
    previous: previousResult.data,
    current: updateResult.data,
    changes: updates,
    timestamp: Date.now()
  });
  
  return updateResult;
}
