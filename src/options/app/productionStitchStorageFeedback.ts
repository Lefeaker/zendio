import { requestVaultConnectionTest } from '@options/services/connectionTester';
import type { ConnectionTestResult } from '@shared/types/connection';
import type { ProductionStitchStorageControllerOptions } from './productionStitchStorageController';
import type { ProductionStitchStorageLoad } from './productionStitchStorageLoad';

export interface ProductionStitchStorageFeedback {
  applyConnectionNotice(result: ConnectionTestResult): void;
  runVaultListConnectionTest(): Promise<ConnectionTestResult>;
}

export function createProductionStitchStorageFeedback(
  options: ProductionStitchStorageControllerOptions,
  load: ProductionStitchStorageLoad
): ProductionStitchStorageFeedback {
  function applyConnectionNotice(result: ConnectionTestResult): void {
    options.setConnectionNotice({
      title: '连接测试结果',
      body:
        result.message || result.error || (result.success ? '连接测试成功。' : '连接测试失败。'),
      variant: result.success ? 'success' : 'danger'
    });
    options.refreshAppData();
  }

  async function runVaultListConnectionTest(): Promise<ConnectionTestResult> {
    const router = load.ensureVaultRouter();
    const vaults = router.vaults.filter((vault, index) => {
      return index === 0 || vault.isDefault || vault.enabled !== false;
    });
    if (vaults.length === 0) {
      return {
        success: false,
        message: '没有可测试的启用仓库。',
        error: '没有可测试的启用仓库。'
      };
    }

    const results = await Promise.all(
      vaults.map(async (vault) => {
        try {
          return await requestVaultConnectionTest(vault, options.getMessagingRepository());
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            message: `[${vault.name || vault.vault || vault.id}] ${message}`,
            error: message
          } satisfies ConnectionTestResult;
        }
      })
    );

    const failures = results.filter((result) => !result.success);
    return {
      success: failures.length === 0,
      message: results.map((result) => result.message || result.error || '').join('\n\n'),
      ...(failures.length
        ? {
            error: failures
              .map((result) => result.error || result.message)
              .filter(Boolean)
              .join('\n\n')
          }
        : {})
    };
  }

  return {
    applyConnectionNotice,
    runVaultListConnectionTest
  };
}
