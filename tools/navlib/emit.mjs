/**
 * emit.mjs — tiny TypeScript source emitter for the generated nav modules.
 *
 * The output is committed to the repo, so it is written in the same style as the
 * hand-written sources: 4-space indent, single quotes, semicolons, `export const`.
 * It must also satisfy web/tsconfig.json's strict flags (notably
 * `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `noUnusedLocals`).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const INDENT = '    ';

export const BANNER = `/**
 * GENERATED FILE — do not edit.
 *
 * Produced by tools/build-nav.mjs from web/public/game/0/mp*.mdt and
 * web/src/data/dungeons.ts. Run \`pnpm --filter zeliard-web nav:build\` to
 * regenerate, then commit the result.
 *
 * See docs/PATHFINDER_PLAN.md §6.
 */
`;

/** Indent every line of a block by `depth` levels. */
function indent(text, depth) {
    const pad = INDENT.repeat(depth);
    return text
        .split('\n')
        .map((line) => (line.length > 0 ? pad + line : line))
        .join('\n');
}

/**
 * Render a JS value as a TypeScript literal.
 * @param {unknown} value
 * @param {number} depth current indent level
 */
export function lit(value, depth = 0) {
    if (value === null) return 'null';
    if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const inner = value.map((v) => lit(v, depth + 1));
        // Wrap long numeric arrays so the file stays reviewable in a diff.
        if (inner.join(', ').length <= 88) return `[${inner.join(', ')}]`;
        return `[\n${indent(inner.join(',\n'), 1)}\n${INDENT.repeat(depth)}]`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value).filter((k) => value[k] !== undefined);
        if (keys.length === 0) return '{}';
        const inner = keys.map((k) => `${k}: ${lit(value[k], depth + 1)},`);
        return `{\n${indent(inner.join('\n'), 1)}\n${INDENT.repeat(depth)}}`;
    }
    throw new Error(`cannot emit ${typeof value}`);
}

/** Render an array of object literals as a typed `readonly` tuple. */
export function emitArray(constName, typeName, items) {
    const head = `export const ${constName}: readonly ${typeName}[] = [`;
    if (items.length === 0) return `${head}];\n`;
    // lit() is called at depth 0 so its closing braces line up with the opening
    // ones once emitArray adds the single level of array indentation.
    return `${head}\n${indent(items.map((it) => lit(it, 0) + ',').join('\n'), 1)}\n];\n`;
}

/** Render a function body that builds a Map from an emitted array. */
export function emitLookup(mapName, constName, typeName, keyExpr) {
    return (
        `/** Lookup by key. Built once at module load; the graph is immutable. */\n`
        + `export const ${mapName}: ReadonlyMap<number, ${typeName}> = new Map(\n`
        + `${INDENT}${constName}.map((e) => [${keyExpr}, e]),\n`
        + `);\n`
    );
}

/** Assemble a generated module's text without touching the filesystem. */
export function renderModule(sections) {
    return BANNER + sections.join('\n');
}

/**
 * Write a generated module (or, with `check`, compare against what is committed).
 * @returns {{ path: string, changed: boolean }}
 */
export function writeModule(path, sections, check) {
    const content = renderModule(sections);
    mkdirSync(dirname(path), { recursive: true });
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
    const changed = existing !== content;
    if (changed && !check) writeFileSync(path, content, 'utf8');
    return { path, changed };
}
