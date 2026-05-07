import type { ResourceSchema, SchemaContext, ViewSchema } from '../types';

import clipper from './surfaces/clipper';
import reader from './surfaces/reader';
import video from './surfaces/video';
import videoFloatingPrompt from './surfaces/video-floating-prompt';
import taskSuccess from './surfaces/task-success';

export const surfaceSchemas: Record<string, ResourceSchema> = {
  clipper,
  reader,
  video,
  'video-floating-prompt': videoFloatingPrompt,
  'task-success': taskSuccess
};

export function getSurfaceView(id: string, ctx: SchemaContext): ViewSchema | null {
  return surfaceSchemas[id]?.createView(ctx) ?? null;
}

export function getSurfaceMeta(id: string): Pick<ResourceSchema, 'openMode' | 'href'> | null {
  const schema = surfaceSchemas[id];
  if (!schema) {
    return null;
  }

  return {
    openMode: schema.openMode,
    ...(schema.href ? { href: schema.href } : {})
  };
}
