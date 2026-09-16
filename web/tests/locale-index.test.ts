import { describe, it, expect, afterEach } from 'vitest';
import { getLocale, setLocale, t, getMessages, getDungeonNotification, getTownName, getDungeonName, getTownConversation, getDungeonSignLines } from '../src/locale/index.js';
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
        expect(getTownName('town.cmap')).toBe('Замок Фелишики');
    });
});

describe('getDungeonName', () => {
    it('returns localized cavern names', () => {
        setLocale('ru');
        expect(getDungeonName('mp10')).toBe('Пещера Малисия');
    });

    it('falls back to English when the locale omits an id', () => {
        setLocale('isv');
        expect(getDungeonName('mp60')).toBe('Pečera Tesoro');
    });
});

describe('getTownConversation', () => {
    it('returns the English conversation with its end code', () => {
        setLocale('en');
        const entry = getTownConversation('bsmp', 0);
        expect(entry?.text).toContain('Bosque Village');
        expect(entry?.endCode).toBeNull();
    });

    it('returns English conversation text in the English locale', () => {
        setLocale('en');
        const entry = getTownConversation('cmap', 0);
        expect(entry?.text).toContain('brave warrior');
    });

    it('returns undefined for a town id absent from every locale', () => {
        setLocale('ru');
        expect(getTownConversation('zzzz', 0)).toBeUndefined();
    });

    it('returns undefined for an unknown npc id', () => {
        setLocale('en');
        expect(getTownConversation('cmap', 999)).toBeUndefined();
    });
});

describe('getDungeonSignLines', () => {
    it('returns localized sign lines with their x offsets', () => {
        setLocale('ru');
        const lines = getDungeonSignLines('mp20', 0);
        expect(lines?.[0]).toEqual({ xDelta: 40, text: 'Опасно!!' });
        expect(lines?.length).toBe(3);
    });

    it('falls back to English for a locale that omits a sign', () => {
        setLocale('isv');
        expect(getDungeonSignLines('mp20', 0)?.[0]?.text).toBe('Opasno!!');
    });

    it('returns null for an unknown sign index', () => {
        setLocale('en');
        expect(getDungeonSignLines('mp20', 99)).toBeNull();
    });

    it('returns null for a dungeon without signs', () => {
        setLocale('en');
        expect(getDungeonSignLines('mp10', 0)).toBeNull();
    });
});

describe('getMessages', () => {
    it('returns the requested locale bundle', () => {
        expect(getMessages('isv').meta.locale).toBe('isv');
    });
});