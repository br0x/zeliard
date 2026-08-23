import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 5d golden-replay recorder. NOT part of normal CI — run with:
 *
 *   REPLAY_RECORD=1 pnpm exec playwright test e2e/record.spec.ts
 *
 * Drives a scripted gameplay session against `?zeliard_record=1`, pulls the
 * captured fixture from `__zeliard.recorder.stop()`, and writes it to
 * tests/fixtures/replay/. The Vitest runner (tests/replay.test.ts) replays
 * fixtures against the real wasm in Node.
 */

const RECORD = process.env.REPLAY_RECORD === '1';
const FIXTURE_PATH = path.resolve(
    import.meta.dirname,
    '../tests/fixtures/replay/town-dungeon-basics.json',
);

test.skip(!RECORD, 'golden-replay recording is gated behind REPLAY_RECORD=1');

interface RecorderHook {
    stats(): { events: number; checkpoints: number } | null;
    stop(): Promise<string>;
}

const MODE = "window.__zeliard.mode()";

/** Wait for main.ts to install the debug hook (intro may still be running). */
async function hookInstalled(page: Page): Promise<void> {
    await page.waitForFunction('!!window.__zeliard', undefined, { timeout: 30_000 });
}

/** Wait for the engine to be fully booted and out of the intro. */
async function hook(page: Page): Promise<void> {
    await page.waitForFunction(
        '!!window.__zeliard && window.__zeliard.ready()',
        undefined,
        { timeout: 30_000 },
    );
}

/** Hold a key for a while, then release (walking/attacking). */
async function hold(page: Page, key: string, ms: number): Promise<void> {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
}

test('records town + dungeon session', async ({ page }) => {
    test.setTimeout(120_000);
    let consoleErrors = 0;
    page.on('pageerror', () => consoleErrors++);

    await page.goto('/?zeliard_record=1');

    // Skip the intro into town.
    await hookInstalled(page);
    for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
    }
    await hook(page);
    await page.waitForTimeout(1000);

    const stats1 = (await page.evaluate(
        'window.__zeliard.recorder.stats()',
    )) as { events: number };
    expect(stats1.events).toBeGreaterThan(0);

    // Walk around the town center (avoids edge-scroll for determinism).
    await hold(page, 'ArrowRight', 700);
    await hold(page, 'ArrowDown', 700);
    await hold(page, 'ArrowLeft', 700);
    await hold(page, 'ArrowUp', 700);

    // Into the first cavern and poke around.
    await page.evaluate('window.__zeliard.enterDungeon(1)');
    await expect.poll(() => page.evaluate(MODE)).toBe('dungeon', { timeout: 15_000 });
    await page.waitForTimeout(500);

    await hold(page, 'ArrowRight', 800);
    await page.keyboard.press('Alt'); // sword swing
    await page.waitForTimeout(300);
    await hold(page, 'ArrowLeft', 600);

    // Back to town and settle.
    await page.evaluate('window.__zeliard.returnToTown()');
    await expect.poll(() => page.evaluate(MODE)).toBe('town', { timeout: 15_000 });
    await page.waitForTimeout(1500);

    const fixtureJson = await page.evaluate(
        'window.__zeliard.recorder.stop()',
    ) as Promise<string> as string;

    const fixture = JSON.parse(fixtureJson) as {
        header: { schemaVersion: number };
        events: unknown[];
        checkpoints: unknown[];
    };
    expect(fixture.header.schemaVersion).toBe(1);
    expect(fixture.events.length).toBeGreaterThan(200);
    expect(fixture.checkpoints.length).toBeGreaterThan(2);
    expect(consoleErrors).toBe(0);

    fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 1) + '\n');
});
