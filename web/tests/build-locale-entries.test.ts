import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCALE_ENTRY_DIRS, emitLocaleEntryCopies } from '../vite.config.js';
import { SUPPORTED_LOCALES } from '../src/core/locale-utils.js';

/**
 * GitHub Pages serves `/<repo>/ru` only when the artifact contains `ru/index.html`;
 * otherwise the request 404s and the page only boots from the 404.html shell.
 */
describe('build locale entry copies', () => {
    let outDir: string;

    beforeEach(() => {
        outDir = mkdtempSync(join(tmpdir(), 'zeliard-dist-'));
        writeFileSync(join(outDir, 'index.html'), '<!DOCTYPE html><title>shell</title>');
    });

    afterEach(() => {
        rmSync(outDir, { recursive: true, force: true });
    });

    it('covers every supported locale', () => {
        expect([...LOCALE_ENTRY_DIRS]).toEqual([...SUPPORTED_LOCALES]);
    });

    it('writes an index.html per locale, byte-identical to the root shell', () => {
        const written = emitLocaleEntryCopies(outDir);
        expect(written.length).toBe(SUPPORTED_LOCALES.length);

        const shell = readFileSync(join(outDir, 'index.html'));
        for (const locale of SUPPORTED_LOCALES) {
            expect(readFileSync(join(outDir, locale, 'index.html'))).toEqual(shell);
        }
    });

    it('creates missing locale directories', () => {
        expect(() => emitLocaleEntryCopies(join(outDir, 'nested'))).toThrow();
        mkdirSync(join(outDir, 'nested'), { recursive: true });
        writeFileSync(join(outDir, 'nested', 'index.html'), 'x');
        emitLocaleEntryCopies(join(outDir, 'nested'));
        expect(readFileSync(join(outDir, 'nested', 'ru', 'index.html'), 'utf-8')).toBe('x');
    });

    it('honours an explicit locale list', () => {
        const written = emitLocaleEntryCopies(outDir, ['ru']);
        expect(written).toHaveLength(1);
        expect(written[0]).toBe(join(outDir, 'ru', 'index.html'));
    });
});