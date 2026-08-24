import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 8e golden-replay recorder #3: a second dungeon map with heavier
 * combat input. Gated behind REPLAY_RECORD=1:
 *
 *   REPLAY_RECORD=1 pnpm exec playwright test e2e/record-dungeon2.spec.ts
 */

const RECORD = process.env.REPLAY_RECORD === '1';
const MAP_ID = 5;
const FIXTURE_PATH = path.resolve(
    import.meta.dirname,
    '../tests/fixtures/replay/dungeon-combat-map5.json',
);

test.skip(!RECORD, 'golden-replay recording is gated behind REPLAY_RECORD=1');

const MODE = "window.__zeliard.mode()";

async function boot(page: Page): Promise<void> {
    await page.goto('/?zeliard_record=1');
    await page.waitForFunction('!!window.__zeliard', undefined, { timeout: 30_000 });
    for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
    }
    await page.waitForFunction('window.__zeliard.ready()', undefined, { timeout: 30_000 });
}

async function hold(page: Page, key: string, ms: number): Promise<void> {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
}

test('records combat-heavy run on dungeon map 5', async ({ page }) => {
    test.setTimeout(180_000);
    let consoleErrors = 0;
    page.on('pageerror', () => consoleErrors++);

    await boot(page);

    await page.evaluate(`window.__zeliard.enterDungeon(${MAP_ID})`);
    await expect.poll(() => page.evaluate(MODE)).toBe('dungeon', { timeout: 15_000 });
    await page.waitForTimeout(500);

    // Combat loop: move in varying directions with sword swings between.
    const pattern: Array<[string, number]> = [
        ['ArrowRight', 700],
        ['Alt', 0],
        ['ArrowDown', 600],
        ['Alt', 0],
        ['ArrowLeft', 700],
        ['Alt', 0],
        ['ArrowUp', 500],
        ['Alt', 0],
    ];
    for (const [key, ms] of pattern) {
        if (ms === 0) {
            await page.keyboard.press(key);
            await page.waitForTimeout(250);
        } else {
            await hold(page, key, ms);
        }
    }

    // Return to town and settle.
    await page.evaluate('window.__zeliard.returnToTown()');
    await expect.poll(() => page.evaluate(MODE)).toBe('town', { timeout: 15_000 });
    await page.waitForTimeout(1200);

    const fixtureJson = (await page.evaluate(
        'window.__zeliard.recorder.stop()',
    )) as Promise<string> as string;

    const fixture = JSON.parse(fixtureJson) as {
        header: { schemaVersion: number };
        events: Array<{ k: string; name?: string }>;
        checkpoints: unknown[];
    };
    expect(fixture.header.schemaVersion).toBe(1);
    expect(fixture.events.length).toBeGreaterThan(300);
    expect(fixture.checkpoints.length).toBeGreaterThan(2);
    expect(consoleErrors).toBe(0);

    fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 1) + '\n');
});
