import type {
  MountedProductionStitchShell,
  ProductionStitchShellDependencies
} from './productionStitchShellTypes';
import { mountProductionStitchShellFromDependencies } from './productionStitchShellMount';

export type {
  MountedProductionStitchShell,
  ProductionStitchShellDependencies
} from './productionStitchShellTypes';

export function mountProductionStitchShell(
  dependencies: ProductionStitchShellDependencies
): MountedProductionStitchShell {
  return mountProductionStitchShellFromDependencies(dependencies);
}
