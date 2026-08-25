/**
 * diag-path.ts — CI-safe scratch paths for test diagnostics.
 *
 * Tests write failure forensics (diff logs, memory snapshots) to the OS
 * temp directory. `/tmp/opencode` only exists on dev machines, so every
 * writer must go through here: the subdirectory is created on first use.
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIAG_DIR = join(tmpdir(), 'zeliard-tests');

export function diagPath(name: string): string {
    mkdirSync(DIAG_DIR, { recursive: true });
    return join(DIAG_DIR, name);
}
