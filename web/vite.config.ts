/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];

/**
 * Locales that get their own static entry point in the build output.
 * Must stay in sync with SUPPORTED_LOCALES in src/core/locale-utils.ts
 * (asserted by tests/build-locale-entries.test.ts).
 */
export const LOCALE_ENTRY_DIRS = ['en', 'ru', 'isv'] as const;

/**
 * Copy the built shell to `<outDir>/<locale>/index.html`.
 *
 * GitHub Pages has no rewrite rules, so `/<repo>/ru` can only be served by a
 * real file. Without these copies that request answers 404 and the app only
 * boots because Pages returns the 404.html shell for unknown paths — the game
 * runs, but the console shows a 404 for the document itself.
 *
 * The copies are byte-identical to index.html on purpose: the locale comes
 * from the URL path at runtime, and the entry script/stylesheet references
 * resolve against the site root (the entry is absolute, the stylesheet and
 * the runtime asset paths are relative to the last path segment).
 */
export function emitLocaleEntryCopies(
    outDir: string,
    locales: readonly string[] = LOCALE_ENTRY_DIRS,
): string[] {
    const indexPath = resolve(outDir, 'index.html');
    const written: string[] = [];
    for (const locale of locales) {
        const dir = resolve(outDir, locale);
        mkdirSync(dir, { recursive: true });
        const target = resolve(dir, 'index.html');
        copyFileSync(indexPath, target);
        written.push(target);
    }
    return written;
}

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
      emitLocaleEntryCopies(outDir);
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