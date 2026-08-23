/// <reference types="vitest/config" />
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
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // main.ts is the composition root (exercised by the Playwright smoke
      // test); the big canvas renderers and the intro/ending timeline engines
      // are pixel-output code verified visually by E2E, per the plan's
      // testing-strategy table.
      exclude: [
        'src/main.ts',
        'src/render/town.ts',
        'src/render/dungeon.ts',
        'src/scenes/opening-intro.ts',
        'src/scenes/ending-demo.ts',
      ],
      thresholds: { statements: 70, branches: 58, functions: 75, lines: 72 },
    },
  },
});
