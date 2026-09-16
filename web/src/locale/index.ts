import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from '../core/locale-utils.js';
import type { DungeonNotification, LocaleMessages, TownConversation } from './schema.js';
import en from './en.json';
import ru from './ru.json';
import isv from './isv.json';

const LOCALE_MESSAGES: Record<Locale, LocaleMessages> = {
    en: en as LocaleMessages,
    ru: ru as LocaleMessages,
    isv: isv as LocaleMessages,
};

let currentLocale: Locale = DEFAULT_LOCALE;

const missingKeysWarned = new Set<string>();

export function getLocale(): Locale {
    return currentLocale;
}

export function setLocale(locale: Locale): void {
    if (!SUPPORTED_LOCALES.includes(locale)) {
        currentLocale = DEFAULT_LOCALE;
        return;
    }
    currentLocale = locale;
}

export function getMessages(locale: Locale = currentLocale): LocaleMessages {
    return LOCALE_MESSAGES[locale] ?? LOCALE_MESSAGES[DEFAULT_LOCALE];
}

export function getEnglishMessages(): LocaleMessages {
    return LOCALE_MESSAGES[DEFAULT_LOCALE];
}

export const messages: LocaleMessages = new Proxy({} as LocaleMessages, {
    get(_target, prop: string) {
        return (getMessages() as unknown as Record<string, unknown>)[prop];
    },
});

function getByPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let cur: unknown = obj;
    for (const part of parts) {
        if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
}

export function t(key: string, params?: Record<string, string | number>): string {
    const primary = getByPath(getMessages(), key);
    const fallback = getByPath(getEnglishMessages(), key);
    let value = primary ?? fallback;

    if (typeof value !== 'string') {
        if (value === undefined) {
            if (import.meta.env?.DEV && !missingKeysWarned.has(key)) {
                missingKeysWarned.add(key);
                console.warn(`[locale] missing key: ${key}`);
            }
            return key;
        }
        return String(value);
    }

    if (params) {
        for (const [name, raw] of Object.entries(params)) {
            value = (value as string).replace(new RegExp(`\\{${name}\\}`, 'g'), String(raw));
        }
    }

    return value as string;
}

export function getDungeonNotification(id: number): DungeonNotification | undefined {
    const key = String(id);
    const primary = getMessages().dungeon.notifications[key];
    if (primary) return primary;
    return getEnglishMessages().dungeon.notifications[key];
}

export function getTownName(townId: string): string | undefined {
    const primary = getMessages().town.names[townId];
    if (primary) return primary;
    return getEnglishMessages().town.names[townId];
}

export function getDungeonName(dungeonId: string): string | undefined {
    const primary = getMessages().dungeon.names[dungeonId];
    if (primary) return primary;
    return getEnglishMessages().dungeon.names[dungeonId];
}

/**
 * Localized NPC conversation for a town/npc id, or undefined when the active
 * locale (and English) have no entry — the caller then uses the MDT bytes.
 */
export function getTownConversation(townId: string, npcId: number): TownConversation | undefined {
    const key = `town.${townId}.npc.${npcId}`;
    const primary = getMessages().town.conversations[key];
    if (primary) return primary;
    return getEnglishMessages().town.conversations[key];
}

export function getList(key: string): string[] {
    const primary = getByPath(getMessages(), key);
    const fallback = getByPath(getEnglishMessages(), key);
    const value = primary ?? fallback;
    return Array.isArray(value) ? (value as string[]) : [];
}

export function getInventoryList(key: string): string[] {
    const primary = getByPath(getMessages().inventory, key);
    const fallback = getByPath(getEnglishMessages().inventory, key);
    const value = primary ?? fallback;
    return Array.isArray(value) ? (value as string[]) : [];
}

export function getInventoryPairs(key: string): string[][] {
    const primary = getByPath(getMessages().inventory, key);
    const fallback = getByPath(getEnglishMessages().inventory, key);
    const value = primary ?? fallback;
    return Array.isArray(value) ? (value as string[][]) : [];
}

export function collectKeys(obj: unknown, prefix = ''): string[] {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
        return prefix ? [prefix] : [];
    }
    const out: string[] = [];
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const next = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            out.push(...collectKeys(value, next));
        } else {
            out.push(next);
        }
    }
    return out;
}

export { LOCALE_MESSAGES };