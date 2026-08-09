export type * from './contracts/action';
export type * from './contracts/binding';
export type * from './contracts/schema';
export type * from './contracts/translation';
export type * from './types/baseTypes';
export type * from './types/surfaceTypes';
export type * from './types/runtimeSurfaceTypes';
export * from './surfaceComponents';
export * from './render/actionAdapter';
export * from './render/nodeRenderers';
export * from './render/renderRuntimeSurface';

import type { RuntimeActionDescriptor, RuntimeActionReference } from './contracts/action';
import type { RuntimeStateBinding } from './contracts/binding';
import type {
  RuntimeButtonVariant,
  RuntimeDynamicValue,
  RuntimeNodeChild,
  RuntimeNodeSchema,
  RuntimePreviewStyle,
  RuntimeResourceSchema,
  RuntimeViewSchema
} from './contracts/schema';
import type { RuntimeSurfaceContext } from './types/runtimeSurfaceTypes';

export type ActionDescriptor = RuntimeActionDescriptor<RuntimeSurfaceContext>;
export type ActionReference = RuntimeActionReference<RuntimeSurfaceContext>;
export type StateBinding = RuntimeStateBinding<RuntimeSurfaceContext>;
export type DynamicValue<T> = RuntimeDynamicValue<T, RuntimeSurfaceContext>;
export type NodeChild = RuntimeNodeChild<RuntimeSurfaceContext>;
export type NodeSchema = RuntimeNodeSchema<RuntimeSurfaceContext>;
export type PreviewStyle = RuntimePreviewStyle;
export type ButtonVariant = RuntimeButtonVariant;
export type ViewSchema = RuntimeViewSchema<RuntimeSurfaceContext>;
export type ResourceSchema = RuntimeResourceSchema<RuntimeSurfaceContext>;

export * from './dom';
