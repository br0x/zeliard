import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site works at any Pages subpath
  // (e.g. https://<user>.github.io/<repo>/) without config changes.
  base: './',
  build: {
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
