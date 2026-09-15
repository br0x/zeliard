export const SUPPORTED_LOCALES = ['en', 'ru', 'isv'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

const LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

export function resolveLocaleFromPath(pathname: string, basePath = '/'): Locale {
    const normalizedBase = basePath.replace(/\/+$/, '');
    let path = pathname;

    if (normalizedBase && normalizedBase !== '/' && path.startsWith(normalizedBase)) {
        path = path.slice(normalizedBase.length);
    }

    path = path.replace(/^\/+/, '');

    if (!path) return DEFAULT_LOCALE;

    const firstSegment = path.split('/')[0]!.replace(/\/+$/, '');

    if (LOCALE_SET.has(firstSegment)) {
        return firstSegment as Locale;
    }

    return DEFAULT_LOCALE;
}

export function stripLocaleFromPath(pathname: string, basePath = '/'): string {
    const normalizedBase = basePath.replace(/\/+$/, '');
    let path = pathname;
    let prefix = '';

    if (normalizedBase && normalizedBase !== '/' && path.startsWith(normalizedBase)) {
        prefix = normalizedBase;
        path = path.slice(normalizedBase.length);
    }

    path = path.replace(/^\/+/, '');

    if (!path) return prefix || '/';

    const segments = path.split('/');
    const first = segments[0]!;

    if (LOCALE_SET.has(first)) {
        const rest = segments.slice(1).join('/');
        const result = prefix ? `${prefix}/${rest}` : `/${rest}`;
        return result.replace(/\/+$/, '') || '/';
    }

    return pathname.replace(/\/+$/, '') || '/';
}

export function buildLocalePath(locale: Locale, restPath = '', basePath = '/'): string {
    const normalizedBase = basePath.replace(/\/+$/, '');
    const normalizedRest = restPath.replace(/^\/+/, '').replace(/\/+$/, '');
    const parts = [normalizedBase, locale, normalizedRest].filter(Boolean);
    const result = parts.join('/');
    return result.startsWith('/') ? result : `/${result}`;
}

export function assetUrl(path: string): string {
    const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
    const normalizedBase = base.replace(/\/+$/, '');
    const normalizedPath = path.replace(/^\/+/, '');
    return `${normalizedBase}/${normalizedPath}`;
}
