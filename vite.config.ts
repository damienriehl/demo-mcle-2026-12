import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { honoDevApi } from './server/dev-plugin.ts';

export default defineConfig(({ mode }) => {
  // Make .env / .env.local values visible to server code (process.env),
  // without overriding variables already set in the shell.
  const fileEnv = loadEnv(mode, process.cwd(), ['MATTER_COCKPIT_', 'HOST', 'PORT']);
  for (const [name, value] of Object.entries(fileEnv)) {
    if (process.env[name] === undefined) process.env[name] = value;
  }

  // Loopback only by default: the API spends the Claude key and has no login.
  // Publish to a tailnet with `tailscale serve`, never by binding 0.0.0.0.
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8982);
  // Extra Host headers to accept, e.g. the box's MagicDNS name behind tailscale serve.
  const allowedHosts = (process.env.MATTER_COCKPIT_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  return {
    plugins: [react(), tailwindcss(), honoDevApi()],
    server: { host, port, strictPort: true, allowedHosts },
  };
});
