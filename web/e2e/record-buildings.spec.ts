import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 7 golden-replay recorder #2: building entries + town edge
 * transitions. Gated behind REPLAY_RECORD=1:
 *
 *   REPLAY_RECORD=1 pnpm exec playwright test e2e/record-buildings.spec.ts
 *
 * Teleports the hero to each building door in the starting town (positions
 * read from the live doors list), enters via Up (door animation → building
 * handshake → indoor scene → finish), then walks off both town edges to
 * exercise edge transitions through the neighboring towns.
 */

const RECORD = process.env.REPLAY_RECORD === '1';
const FIXTURE_PATH = path.resolve(
    import.meta.dirname,
    '../tests/fixtures/replay/town-buildings.json',
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
    await page.waitForTimeout(800);
}

async function leaveBuilding(page: Page): Promise<void> {
    // Buildings exit via the door tile: walk down/left a little, then Up on
    // the exit or scene auto-finish. Press a few keys; assert flag clears.
    for (let i = 0; i < 8; i++) {
        const bld = (await page.evaluate('window.__zeliard.bldActive()')) as number;
        if (!bld) return;
        await page.keyboard.press(i % 2 === 0 ? 'ArrowDown' : 'Escape');
        await page.waitForTimeout(400);
    }
    await expect
        .poll(() => page.evaluate('window.__zeliard.bldActive()'), { timeout: 15_000 })
        .toBe(0);
}

test('records building entries + edge transitions', async ({ page }) => {
    test.setTimeout(180_000);
    let consoleErrors = 0;
    page.on('pageerror', () => consoleErrors++);

    await boot(page);

    const stats0 = (await page.evaluate(
        'window.__zeliard.recorder.stats()',
    )) as { events: number };
    expect(stats0.events).toBeGreaterThan(0);

    // ── Edge transitions: hold Right from spawn until the town changes,
    // then hold Left to come back. Real player path — no teleports. ──
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(9000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(2000); // pending transition + async town load
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(12000);
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(2000);

    // ── Building entry: the King (door x=95, dest 0) ────────────────────
    // Adaptive walk toward the castle door.
    for (let i = 0; i < 40; i++) {
        const pos = (await page.evaluate('window.__zeliard.heroPos()')) as { lcol: number; xv: number };
        const abs = pos.lcol + pos.xv + 4;
        if (abs >= 94 && abs <= 96) break;
        const dir = abs < 94 ? 'ArrowRight' : 'ArrowLeft';
        await page.keyboard.down(dir);
        await page.waitForTimeout(420);
        await page.keyboard.up(dir);
        await page.waitForTimeout(120);
    }

    // Enter: Up at the door (abs hero x within ±1 of 95).
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(600);
    await page.keyboard.up('ArrowUp');
    let entered = false;
    for (let t = 0; t < 5; t++) {
        await page.waitForTimeout(400);
        if (((await page.evaluate('window.__zeliard.bldActive()')) as number) !== 0) {
            entered = true;
            break;
        }
    }
    expect(entered, 'king building should activate after Up at door').toBe(true);

    // Talk through the audience, then walk out through the door.
    for (let i = 0; i < 20 && ((await page.evaluate('window.__zeliard.bldActive()')) as number) !== 0; i++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(320);
    }
    for (let i = 0; i < 14 && ((await page.evaluate('window.__zeliard.bldActive()')) as number) !== 0; i++) {
        await page.keyboard.down('ArrowDown');
        await page.waitForTimeout(300);
        await page.keyboard.up('ArrowDown');
    }
    await expect
        .poll(() => page.evaluate('window.__zeliard.bldActive()'), { timeout: 15_000 })
        .toBe(0);
    await page.waitForTimeout(500);

    const fixtureJson = (await page.evaluate(
        'window.__zeliard.recorder.stop()',
    )) as Promise<string> as string;

    const fixture = JSON.parse(fixtureJson) as {
        header: { schemaVersion: number };
        events: Array<{ k: string; name?: string }>;
        checkpoints: unknown[];
    };
    expect(fixture.header.schemaVersion).toBe(1);
    const names = fixture.events.map((e) => e.name);
    expect(names).toContain('wasm_town_update');
    expect(names).toContain('wasm_town_complete_transition');
    expect(names).toContain('wasm_town_building_finish');
    expect(names).toContain('wasm_town_entry_disabling_edge_scroll');
    expect(consoleErrors).toBe(0);

    fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 1) + '\n');
});
