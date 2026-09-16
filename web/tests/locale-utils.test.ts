import { describe, it, expect } from 'vitest';
import {
    DEFAULT_LOCALE,
    SUPPORTED_LOCALES,
    resolveLocaleFromPath,
    stripLocaleFromPath,
    buildLocalePath,
    assetUrl,
} from '../src/core/locale-utils.js';

describe('SUPPORTED_LOCALES', () => {
    it('contains exactly en, ru, isv', () => {
        expect([...SUPPORTED_LOCALES]).toEqual(['en', 'ru', 'isv']);
    });

    it('defaults to en', () => {
        expect(DEFAULT_LOCALE).toBe('en');
    });
});

describe('resolveLocaleFromPath', () => {
    it('resolves / to en', () => {
        expect(resolveLocaleFromPath('/')).toBe('en');
    });

    it('resolves /en to en', () => {
        expect(resolveLocaleFromPath('/en')).toBe('en');
    });

    it('resolves /en/ to en', () => {
        expect(resolveLocaleFromPath('/en/')).toBe('en');
    });

    it('resolves /ru to ru', () => {
        expect(resolveLocaleFromPath('/ru')).toBe('ru');
    });

    it('resolves /ru/ to ru', () => {
        expect(resolveLocaleFromPath('/ru/')).toBe('ru');
    });

    it('resolves /ru/deep/path to ru', () => {
        expect(resolveLocaleFromPath('/ru/deep/path')).toBe('ru');
    });

    it('resolves /isv to isv', () => {
        expect(resolveLocaleFromPath('/isv')).toBe('isv');
    });

    it('resolves /isv/ to isv', () => {
        expect(resolveLocaleFromPath('/isv/')).toBe('isv');
    });

    it('falls back to en for unknown paths', () => {
        expect(resolveLocaleFromPath('/fr')).toBe('en');
        expect(resolveLocaleFromPath('/is')).toBe('en');
        expect(resolveLocaleFromPath('/unknown/path')).toBe('en');
    });

    it('handles a GitHub Pages base path', () => {
        expect(resolveLocaleFromPath('/zeliard/ru', '/zeliard/')).toBe('ru');
        expect(resolveLocaleFromPath('/zeliard/isv', '/zeliard/')).toBe('isv');
        expect(resolveLocaleFromPath('/zeliard/', '/zeliard/')).toBe('en');
        expect(resolveLocaleFromPath('/zeliard/en', '/zeliard/')).toBe('en');
    });

    it('does not strip a base path when the pathname does not start with it', () => {
        expect(resolveLocaleFromPath('/ru', '/zeliard/')).toBe('ru');
    });
});

describe('stripLocaleFromPath', () => {
    it('strips /ru', () => {
        expect(stripLocaleFromPath('/ru')).toBe('/');
    });

    it('strips /ru/', () => {
        expect(stripLocaleFromPath('/ru/')).toBe('/');
    });

    it('strips /en', () => {
        expect(stripLocaleFromPath('/en')).toBe('/');
    });

    it('strips /isv', () => {
        expect(stripLocaleFromPath('/isv')).toBe('/');
    });

    it('keeps the rest of the path', () => {
        expect(stripLocaleFromPath('/ru/foo/bar')).toBe('/foo/bar');
    });

    it('leaves a non-locale path unchanged', () => {
        expect(stripLocaleFromPath('/foo/bar')).toBe('/foo/bar');
    });

    it('handles a base path', () => {
        expect(stripLocaleFromPath('/zeliard/ru/foo', '/zeliard/')).toBe('/zeliard/foo');
        expect(stripLocaleFromPath('/zeliard/ru', '/zeliard/')).toBe('/zeliard');
    });
});

describe('buildLocalePath', () => {
    it('builds a locale root', () => {
        expect(buildLocalePath('ru')).toBe('/ru');
    });

    it('builds a nested path', () => {
        expect(buildLocalePath('ru', 'foo/bar')).toBe('/ru/foo/bar');
    });

    it('normalizes slashes', () => {
        expect(buildLocalePath('isv', '/foo/')).toBe('/isv/foo');
    });

    it('prepends a base path', () => {
        expect(buildLocalePath('ru', '', '/zeliard')).toBe('/zeliard/ru');
    });
});

describe('assetUrl', () => {
    it('produces a root-relative URL by default', () => {
        expect(assetUrl('game/0/cmap.mdt')).toBe('/game/0/cmap.mdt');
    });

    it('strips leading slashes from the asset path', () => {
        expect(assetUrl('/game/0/cmap.mdt')).toBe('/game/0/cmap.mdt');
    });
});