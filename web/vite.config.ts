/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];

function spaFallback(): Plugin {
  let outDir = 'dist';
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'));
    },
  };
}

export default defineConfig(({ command }) => ({
  // Path-based locales (/ru, /isv) need an absolute base: a relative base
  // makes import.meta.env.BASE_URL './', which breaks locale resolution and
  // makes the 404.html SPA shell resolve assets under the locale path.
  // On GitHub Pages the site lives at /<repo>/, locally at /.
  base: command === 'build' && process.env.GITHUB_ACTIONS && repoName ? `/${repoName}/` : '/',
  plugins: [spaFallback()],
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
}));