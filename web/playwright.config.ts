import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,
    // Baselines are generated per-platform; CI (linux) matches the checked-in set.
    snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
    use: {
        baseURL: 'http://localhost:5173',
        viewport: { width: 1280, height: 800 },
        // The game canvas animates continuously; screenshots target a frozen
        // scene right after transitions, with a small diff ratio for AA noise.
    },
    expect: {
        toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
    },
    webServer: {
        command: 'pnpm dev --port 5173 --strictPort',
        port: 5173,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
});
