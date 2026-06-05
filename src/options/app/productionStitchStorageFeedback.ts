import type { ConnectionTestResult } from '@shared/types/connection';
import type {
  ProductionStitchStorageControllerOptions,
  ProductionStitchStorageLoad
} from './productionStitchStorageTypes';
import { runVaultListConnectionTest as runVaultListConnectionTestHelper } from './vaultConnectionTests';

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
    return runVaultListConnectionTestHelper(
      load.ensureVaultRouter(),
      options.getMessagingRepository()
    );
  }

  return {
    applyConnectionNotice,
    runVaultListConnectionTest
  };
}
