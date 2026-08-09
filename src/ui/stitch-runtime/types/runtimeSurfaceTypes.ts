import type { RuntimeSchemaContext } from '../contracts/schema';
import type { RuntimeSurfaceContent } from './surfaceTypes';

export type RuntimeSurfaceTheme = 'light' | 'dark';

export interface RuntimeSurfaceState {
  previewTheme: RuntimeSurfaceTheme;
}

export type RuntimeSurfaceContext = RuntimeSchemaContext<
  RuntimeSurfaceContent,
  RuntimeSurfaceState
>;
