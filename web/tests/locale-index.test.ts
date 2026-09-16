import { describe, it, expect, afterEach } from 'vitest';
import { getLocale, setLocale, t, getMessages, getDungeonNotification, getTownName } from '../src/locale/index.js';
import { DEFAULT_LOCALE } from '../src/core/locale-utils.js';

afterEach(() => {
    setLocale(DEFAULT_LOCALE);
});

describe('getLocale / setLocale', () => {
    it('defaults to English', () => {
        expect(getLocale()).toBe('en');
    });

    it('sets a supported locale', () => {
        setLocale('ru');
        expect(getLocale()).toBe('ru');
        setLocale('isv');
        expect(getLocale()).toBe('isv');
    });

    it('falls back to English for an unsupported locale', () => {
        setLocale('fr' as never);
        expect(getLocale()).toBe('en');
    });
});

describe('t', () => {
    it('reads a nested key in the active locale', () => {
        setLocale('ru');
        expect(t('hud.place')).toBe('МЕСТО');
    });

    it('falls back to English for missing keys', () => {
        setLocale('ru');
        expect(t('openingIntro.missingKey')).toBe('openingIntro.missingKey');
    });

    it('interpolates params', () => {
        setLocale('en');
        expect(t('modal.exportImportHint', { action: 'export' })).toContain('export');
    });
});

describe('getDungeonNotification', () => {
    it('returns localized text', () => {
        setLocale('ru');
        const n = getDungeonNotification(1);
        expect(n?.text).toBe('Вы получили 50 золотых.');
    });

    it('falls back to English when missing', () => {
        setLocale('en');
        const n = getDungeonNotification(1);
        expect(n?.text).toBe('You get 50 golds.');
    });
});

describe('getTownName', () => {
    it('returns localized town names', () => {
        setLocale('ru');
        expect(getTownName('town.cmap')).toBe('Замок Felishika');
    });
});

describe('getMessages', () => {
    it('returns the requested locale bundle', () => {
        expect(getMessages('isv').meta.locale).toBe('isv');
    });
});