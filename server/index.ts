import { Hono, type Context } from 'hono';
import { matterEvents } from './events';
import { getMatterStore, type MatterStore } from './store';
import { createIntakeRoutes } from './intake/routes';

export type FeatureModule = { default?: unknown };

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Every server/features/<slug>.ts file that default-exports a Hono app is
 * mounted at /api/features/<slug>. Vite re-evaluates this glob when a feature
 * file is added, edited, or removed, so new routes appear without a restart.
 */
const featureFiles = import.meta.glob<FeatureModule>('./features/*.ts', { eager: true });

function isHonoApp(value: unknown): value is Hono {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Hono).fetch === 'function' &&
    typeof (value as Hono).route === 'function'
  );
}

export function mountFeatures(app: Hono, modules: Record<string, FeatureModule>): string[] {
  const mounted: string[] = [];
  for (const [path, mod] of Object.entries(modules)) {
    const slug = path.split('/').pop()!.replace(/\.ts$/, '');
    if (!SLUG.test(slug)) {
      console.warn(`[features] skipped ${path}: file name must be lowercase letters, digits, and dashes`);
      continue;
    }
    if (!isHonoApp(mod.default)) {
      console.warn(`[features] skipped ${path}: default export is not a Hono app`);
      continue;
    }
    app.route(`/api/features/${slug}`, mod.default);
    mounted.push(slug);
  }
  return mounted;
}

export function createApp(modules: Record<string, FeatureModule> = featureFiles, store: MatterStore = getMatterStore()): Hono {
  const app = new Hono();
  app.get('/api/health', (c) => c.json({ ok: true }));
  app.get('/api/events', (c) => matterEvents(store, c.req.raw.signal));
  app.get('/api/matters', (c) => c.json(store.list()));
  app.get('/api/matters/:id', (c) => {
    const matter = store.get(c.req.param('id'));
    return matter ? c.json(matter) : c.json({ error: 'not_found' }, 404);
  });
  const writeMatter = async (c: Context) => {
    try {
      const value: unknown = await c.req.json();
      const id = c.req.param('id');
      if (id && (typeof value !== 'object' || value === null || !('id' in value) || value.id !== id)) {
        return c.json({ error: 'invalid_matter', message: 'id: must match the URL' }, 400);
      }
      return c.json(store.upsert(value));
    } catch (error) {
      // The singleton's errors may come from a previous Vite module evaluation.
      if (error instanceof Error && (error.name === 'StoreValidationError' || error instanceof SyntaxError)) {
        return c.json({ error: 'invalid_matter', message: error.message }, 400);
      }
      throw error;
    }
  };
  app.post('/api/matters', writeMatter);
  app.put('/api/matters/:id', writeMatter);
  app.delete('/api/matters/:id', (c) => store.remove(c.req.param('id'))
    ? c.body(null, 204) : c.json({ error: 'not_found' }, 404));
  app.route('/api/intake', createIntakeRoutes({ store }));
  mountFeatures(app, modules);
  app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));
  return app;
}

export const app = createApp();
