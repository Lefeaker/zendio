import { resolveSchemaValue } from './binding';
import type { ViewSchema } from './contracts';
import { el } from './dom';
import { asString, type SchemaRendererRuntime } from './rendererContext';

export function renderHero<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  view: ViewSchema<State, AppData>
): HTMLElement | null {
  if (!view.hero) {
    return null;
  }
  const ctx = runtime.getContext();
  const title = resolveSchemaValue(view.hero.title, ctx);
  if (!title) {
    return null;
  }
  const description = resolveSchemaValue(view.hero.description, ctx);
  const pills = resolveSchemaValue(view.hero.pills, ctx) ?? [];

  return el(
    'header',
    { className: 'schema-hero' },
    el(
      'div',
      { className: 'schema-hero-copy' },
      el('h2', { className: 'schema-hero-title', text: asString(title) }),
      description
        ? el('p', { className: 'schema-hero-description', text: asString(description) })
        : null
    ),
    pills.length
      ? el(
          'div',
          { className: 'schema-hero-pills' },
          pills.map((pill) => el('span', { className: 'schema-hero-pill', text: pill }))
        )
      : null
  );
}
