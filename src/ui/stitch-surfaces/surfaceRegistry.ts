import type { ResourceSchema, RuntimeSurfaceContext, ViewSchema } from '@ui/stitch-runtime';

import clipper from './surfaces/clipper';
import reader from './surfaces/reader';
import video from './surfaces/video';
import videoControlBarPopover from './surfaces/video-control-bar-popover';
import videoFloatingPrompt from './surfaces/video-floating-prompt';
import taskSuccess from './surfaces/task-success';

export const RUNTIME_SURFACE_IDS = [
  'clipper',
  'reader',
  'video',
  'video-control-bar-popover',
  'video-floating-prompt',
  'task-success'
] as const;

export type RuntimeSurfaceId = (typeof RUNTIME_SURFACE_IDS)[number];

export const surfaceSchemas: Record<RuntimeSurfaceId, ResourceSchema> = {
  clipper,
  reader,
  video,
  'video-control-bar-popover': videoControlBarPopover,
  'video-floating-prompt': videoFloatingPrompt,
  'task-success': taskSuccess
};

export function isRuntimeSurfaceId(id: string): id is RuntimeSurfaceId {
  return Object.prototype.hasOwnProperty.call(surfaceSchemas, id);
}

export function getSurfaceView(id: string, ctx: RuntimeSurfaceContext): ViewSchema | null {
  if (!isRuntimeSurfaceId(id)) {
    return null;
  }
  return surfaceSchemas[id]?.createView(ctx) ?? null;
}

export function getSurfaceMeta(id: string): Pick<ResourceSchema, 'openMode' | 'href'> | null {
  if (!isRuntimeSurfaceId(id)) {
    return null;
  }
  const schema = surfaceSchemas[id];
  if (!schema) {
    return null;
  }

  return {
    openMode: schema.openMode,
    ...(schema.href ? { href: schema.href } : {})
  };
}
