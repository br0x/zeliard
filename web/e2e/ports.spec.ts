import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 5e live verification: the leaf TS ports serve real gameplay.
 *
 * - cutover mode: dispatched exports run entirely from TS; any behavioral
 *   divergence breaks the session (transitions never complete, mode stuck).
 * - shadow mode: wasm stays authoritative while the harness dual-runs the
 *   TS implementations; `shadow.state()` must report zero divergences.
 *
 * Compresses regression checklist items 1-4: boot → intro → town → dungeon →
 * back to town, with walking and a sword swing.
 */

const MODE = "window.__zeliard.mode()";

async function boot(page: Page, query: string): Promise<void> {
    await page.goto(`/?${query}`);
    await page.waitForFunction('!!window.__zeliard', undefined, { timeout: 30_000 });
    for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
    }
    await page.waitForFunction(
        'window.__zeliard.ready()',
        undefined,
        { timeout: 30_000 },
    );
}

async function walkAndFight(page: Page): Promise<void> {
    const hold = async (key: string, ms: number): Promise<void> => {
        await page.keyboard.down(key);
        await page.waitForTimeout(ms);
        await page.keyboard.up(key);
    };
    await hold('ArrowRight', 500);
    await hold('ArrowDown', 400);
    await page.keyboard.press('Alt'); // sword swing (input latch path)
    await page.waitForTimeout(300);
}

async function playSession(page: Page): Promise<void> {
    await expect.poll(() => page.evaluate(MODE)).toBe('town');

    await walkAndFight(page);

    await page.evaluate('window.__zeliard.enterDungeon(1)');
    await expect.poll(() => page.evaluate(MODE)).toBe('dungeon', { timeout: 15_000 });
    await walkAndFight(page);

    await page.evaluate('window.__zeliard.returnToTown()');
    await expect.poll(() => page.evaluate(MODE)).toBe('town', { timeout: 15_000 });
    await page.waitForTimeout(800);
}

test.describe('stage 5e leaf ports under load', () => {
    let consoleErrors: string[];

    test.beforeEach(async ({ page }) => {
        consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', err => consoleErrors.push(String(err)));
    });

    test('cutover mode plays intro→town→dungeon→town entirely on TS ports', async ({ page }) => {
        test.setTimeout(90_000);
        await boot(page, 'zeliard_ports=cutover');
        const ports = await page.evaluate('window.__zeliard.ports.state()') as Record<string, string>;
        expect(Object.keys(ports).length).toBeGreaterThanOrEqual(9);
        expect(Object.values(ports).every((m) => m === 'cutover')).toBe(true);

        await playSession(page);
        expect(consoleErrors).toEqual([]);
    });

    test('shadow mode reports zero divergences after a play session', async ({ page }) => {
        test.setTimeout(90_000);
        await boot(page, 'zeliard_ports=shadow');
        const ports = await page.evaluate('window.__zeliard.ports.state()') as Record<string, string>;
        expect(Object.values(ports).every((m) => m === 'shadow')).toBe(true);

        await playSession(page);

        const shadowState = await page.evaluate(
            'window.__zeliard.shadow.state()',
        ) as { calls: number; divergences: number; clean: boolean };
        expect(shadowState.calls).toBeGreaterThan(100);
        expect(shadowState.divergences, 'shadow divergences').toBe(0);
        expect(consoleErrors).toEqual([]);
    });
});
