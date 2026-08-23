import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 4 E2E smoke: boot → intro → town → one dungeon room → back to town.
 * Drives the game through the `window.__zeliard` debug hook so the test does
 * not depend on map layout, and takes screenshot baselines of the canvas at
 * each stage (regression checklist items 1–4 in compressed form).
 */

/** Debug hook installed by main.ts on window.__zeliard. */
interface ZeliardHook {
    ready(): boolean;
    mode(): string;
}

const zeliard = () => (window as unknown as Record<string, unknown>).__zeliard as ZeliardHook;

const MODE = "window.__zeliard.mode()";
const READY = "!!window.__zeliard && window.__zeliard.ready()"

/** Wait for main.ts to install the hook and finish booting the engine. */
async function hook(page: Page): Promise<void> {
    await page.waitForFunction(READY, undefined, { timeout: 30_000 });
}

/** Skip through the opening intro with Space (early page → credits → finish). */
async function skipIntro(page: Page): Promise<void> {
    for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
    }
}

const gameCanvas = '#gameCanvas';

test.describe('zeliard web port smoke', () => {
    let consoleErrors: string[];

    test.beforeEach(async ({ page }) => {
        consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', err => consoleErrors.push(String(err)));
        await page.goto('/');
        await skipIntro(page);
    });

    test('boots into town and renders the game canvas', async ({ page }) => {
        await hook(page);
        await expect(page.locator(gameCanvas)).toBeVisible();
        // Town music/HUD are live once engineReady flips — the mode is 'town'.
        await expect.poll(() => page.evaluate(MODE)).toBe('town');

        // No runtime errors during boot + intro.
        expect(consoleErrors).toEqual([]);
    });

    test('town canvas matches baseline', async ({ page }) => {
        await hook(page);
        // Freeze-frame: take the shot immediately after load; the town idle
        // animation differs slightly between frames, hence the diff ratio.
        const shot = page.locator(gameCanvas);
        await expect(shot).toBeVisible();
        await expect(shot).toHaveScreenshot('town.png');
        expect(consoleErrors).toEqual([]);
    });

    test('enters a dungeon room and returns to town', async ({ page }) => {
        const z = await hook(page);

        await page.evaluate(() =>
            ((window as unknown as Record<string, unknown>).__zeliard as { enterDungeon(m: number): Promise<void> }).enterDungeon(1),
        );
        await expect.poll(() => page.evaluate(MODE)).toBe('dungeon', { timeout: 15_000 });
        await expect(page.locator(gameCanvas)).toBeVisible();
        await page.waitForTimeout(500); // let one render pass settle

        await expect(page.locator(gameCanvas)).toHaveScreenshot('dungeon.png');

        await page.evaluate(() =>
            ((window as unknown as Record<string, unknown>).__zeliard as { returnToTown(): Promise<void> }).returnToTown(),
        );
        await expect.poll(() => page.evaluate(MODE)).toBe('town', { timeout: 15_000 });

        expect(consoleErrors).toEqual([]);
    });
});
