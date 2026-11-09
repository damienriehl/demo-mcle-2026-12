import { getRequestListener } from '@hono/node-server';
import type { Plugin } from 'vite';

/**
 * Serves the Hono API inside the Vite dev server, so the client and the API
 * share one port. The app module is loaded through Vite on every request, so
 * an edit to any server file takes effect on the next request, no restart.
 */
export function honoDevApi(entry = '/server/index.ts'): Plugin {
  return {
    name: 'matter-cockpit-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/') && req.url !== '/api') return next();
        try {
          const mod = (await server.ssrLoadModule(entry)) as { app: { fetch: (r: Request) => Response | Promise<Response> } };
          await getRequestListener(mod.app.fetch, { overrideGlobalObjects: false })(req, res);
        } catch (error) {
          if (error instanceof Error) server.ssrFixStacktrace(error);
          server.config.logger.error(`[api] ${error instanceof Error ? error.stack : String(error)}`);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
          }
          res.end(JSON.stringify({ error: 'server_error', message: error instanceof Error ? error.message : String(error) }));
        }
      });
    },
  };
}
