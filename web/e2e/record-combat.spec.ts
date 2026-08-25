import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 9 follow-up recorder: a long real-input combat session in the first
 * cavern — walking both directions, constant sword swings (kills), doubling
 * back over corpse spots, Up/Down presses (platforms/rope/crouch). NOT part
 * of normal CI:
 *
 *   REPLAY_RECORD=1 pnpm exec playwright test e2e/record-combat.spec.ts
 *
 * The Vitest runner replays the fixture against wasm AND the full-TS
 * surface; any divergence pinpoints the live-play regression.
 */

const RECORD = process.env.REPLAY_RECORD === '1';
const FIXTURE_PATH = path.resolve(
    import.meta.dirname,
    '../tests/fixtures/replay/combat-walk.json',
);

test.skip(!RECORD, 'golden-replay recording is gated behind REPLAY_RECORD=1');

const MODE = "window.__zeliard.mode()";

async function hookInstalled(page: Page): Promise<void> {
    await page.waitForFunction('!!window.__zeliard', undefined, { timeout: 30_000 });
}

async function hook(page: Page): Promise<void> {
    await page.waitForFunction(
        '!!window.__zeliard && window.__zeliard.ready()',
        undefined,
        { timeout: 30_000 },
    );
}

async function hold(page: Page, key: string, ms: number): Promise<void> {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
}

test('records combat + walk session', async ({ page }) => {
    test.setTimeout(300_000);
    let consoleErrors = 0;
    page.on('pageerror', () => consoleErrors++);

    await page.goto('/?zeliard_record=1&zeliard_ports=wasm');

    // Skip the intro into town.
    await hookInstalled(page);
    for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
    }
    await hook(page);
    await page.waitForTimeout(1000);

    // Into the first cavern.
    await page.evaluate('window.__zeliard.enterDungeon(0)');
    await expect.poll(() => page.evaluate(MODE)).toBe('dungeon', { timeout: 15_000 });
    await page.waitForTimeout(4000); // roka run settles

    // Combat loop: advance slowly while swinging constantly; every so often
    // double back over ground just covered (corpse cells), press Up/Down
    // (platforms / rope / doors), and pause.
    for (let round = 0; round < 12; round++) {
        const dir = round % 4 === 2 || round % 4 === 3 ? 'ArrowLeft' : 'ArrowRight';
        for (let step = 0; step < 6; step++) {
            await hold(page, dir, 160);
            await page.keyboard.press('Space'); // sword swing
            await page.waitForTimeout(240);
        }
        if (round % 2 === 1) {
            await hold(page, 'ArrowUp', 150);
            await hold(page, 'ArrowDown', 150);
        }
        await page.waitForTimeout(400);
    }

    expect(consoleErrors).toBe(0);

    const fixtureJson = await page.evaluate(
        'window.__zeliard.recorder.stop()',
    ) as Promise<string> as string;

    const fixture = JSON.parse(fixtureJson) as {
        header: { schemaVersion: number };
        events: unknown[];
        checkpoints: unknown[];
    };
    expect(fixture.header.schemaVersion).toBe(1);
    expect(fixture.events.length).toBeGreaterThan(1000);
    expect(fixture.checkpoints.length).toBeGreaterThan(10);
    fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 1) + '\n');
});
