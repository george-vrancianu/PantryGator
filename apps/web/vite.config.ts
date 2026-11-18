/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
// A relative path, not the package name: Vite bundles the config's local
// imports but hands workspace packages to Node, which can't resolve the UI
// package's extensionless TypeScript imports.
import { prePaintScript } from '../../packages/ui/src/theme/appearance';

/**
 * Inlines the appearance pre-paint script at the end of `<head>`, after the
 * `theme-color` tags it updates and before React mounts, so the first paint
 * is already in the right Theme.
 */
function prePaintTheme(): Plugin {
  return {
    name: 'pocket-pantry:pre-paint-theme',
    transformIndexHtml: () => [
      { tag: 'script', children: prePaintScript(), injectTo: 'head' },
    ],
  };
}

// The app calls `/api` on its own origin, so a phone or HTTPS tunnel only needs Vite's port.
// Only the API's own prefix: a route like `/apiary` stays with the app.
const proxy = {
  '^/api(/|\\?|$)': `http://localhost:${process.env.API_PORT ?? 3000}`,
};
// HTTPS tunnels, which iPhone Safari needs before it grants the camera.
const allowedHosts = [
  '.trycloudflare.com',
  '.ngrok-free.app',
  '.ngrok-free.dev',
];

export default defineConfig({
  // Vite 8 reads the `@/*` alias from tsconfig `paths` itself; vitest reuses this config.
  resolve: { tsconfigPaths: true },
  plugins: [react(), prePaintTheme()],
  server: {
    // Bind to every interface so phones on the local network can reach Vite.
    // The API allows these origins on ports 5173 and 5174.
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy,
    allowedHosts,
  },
  preview: { proxy, allowedHosts },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    testTimeout: 15000,
  },
});
