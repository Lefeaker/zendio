import type { ResourceSchema, SchemaContext, SettingsSchema, ViewSchema } from '../types';

import overview from './settings/overview';
import storage from './settings/storage';
import captureSources from './settings/capture-sources';
import captureBehavior from './settings/capture-behavior';
import output from './settings/output';
import experimental from './settings/experimental';
import maintenance from './settings/maintenance';

import onboarding from './resources/onboarding';
import pluginSetup from './resources/plugin-setup';
import support from './resources/support';
import suggestions from './resources/suggestions';
import contact from './resources/contact';
import changelog from './resources/changelog';
import privacyPolicy from './resources/privacy-policy';
import dataUsage from './resources/data-usage';
import { getSurfaceMeta, getSurfaceView, surfaceSchemas } from './surfaceRegistry';

export { surfaceSchemas } from './surfaceRegistry';

export const settingsSchemas: Record<string, SettingsSchema> = {
  overview,
  storage,
  'capture-sources': captureSources,
  'capture-behavior': captureBehavior,
  output,
  experimental,
  maintenance
};

export const resourceSchemas: Record<string, ResourceSchema> = {
  onboarding,
  'plugin-setup': pluginSetup,
  support,
  suggestions,
  contact,
  changelog,
  'privacy-policy': privacyPolicy,
  'data-usage': dataUsage
};

export function getSettingsView(id: string, ctx: SchemaContext): ViewSchema | null {
  return settingsSchemas[id]?.createView(ctx) ?? null;
}

export function getResourceView(id: string, ctx: SchemaContext): ViewSchema | null {
  return resourceSchemas[id]?.createView(ctx) ?? null;
}

export function getResourceMeta(id: string): Pick<ResourceSchema, 'openMode' | 'href'> | null {
  const schema = resourceSchemas[id];
  if (!schema) {
    return null;
  }

  return {
    openMode: schema.openMode,
    ...(schema.href ? { href: schema.href } : {})
  };
}

function resolveFooterSchema(id: string): ResourceSchema | null {
  return resourceSchemas[id] ?? surfaceSchemas[id] ?? null;
}

export function getFooterView(id: string, ctx: SchemaContext): ViewSchema | null {
  return resourceSchemas[id]?.createView(ctx) ?? getSurfaceView(id, ctx);
}

export function getFooterMeta(id: string): Pick<ResourceSchema, 'openMode' | 'href'> | null {
  const schema = resourceSchemas[id] ?? null;
  if (!schema) {
    return getSurfaceMeta(id);
  }

  return {
    openMode: schema.openMode,
    ...(schema.href ? { href: schema.href } : {})
  };
}
