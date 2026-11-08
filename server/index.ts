import { Hono } from 'hono';

/** A module loaded from server/features/*.ts. Its default export should be a Hono app. */
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

/** Mounts feature sub-apps under /api/features/<slug> and returns the mounted slugs. */
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

export function createApp(modules: Record<string, FeatureModule> = featureFiles): Hono {
  const app = new Hono();
  app.get('/api/health', (c) => c.json({ ok: true }));
  mountFeatures(app, modules);
  app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));
  return app;
}

export const app = createApp();
