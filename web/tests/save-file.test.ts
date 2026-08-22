// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    SAVE_FILE_SIZE,
    downloadSaveFile,
    pickSaveFile,
} from '../src/platform/save-file.js';

describe('downloadSaveFile', () => {
    it('creates an anchor click named after the slot', () => {
        const appendSpy = vi.spyOn(document.body, 'appendChild');
        const removeSpy = vi.spyOn(document.body, 'removeChild');
        const clickSpy = vi.fn();
        const origCreate = document.createElement.bind(document);

        // Intercept only <a> creation so we can observe the download attrs.
        const createElementOrig = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
            const el = createElementOrig(tag);
            if (tag === 'a') (el as HTMLAnchorElement).click = clickSpy;
            return el;
        }) as typeof document.createElement);

        downloadSaveFile('castle', new Uint8Array([1, 2, 3]));

        expect(clickSpy).toHaveBeenCalled();
        const anchor = appendSpy.mock.calls.map((c) => c[0] as HTMLAnchorElement)
            .find((el) => el.tagName === 'A')!;
        expect(anchor.download).toBe('castle.sav');
        expect(removeSpy).toHaveBeenCalled();

        appendSpy.mockRestore();
        removeSpy.mockRestore();
        (document.createElement as ReturnType<typeof vi.spyOn>).mockRestore();
        void origCreate;
    });

    it('revokeObjectURL is called for cleanup', () => {
        const revoke = vi.fn();
        URL.revokeObjectURL = revoke;
        downloadSaveFile('x', new Uint8Array(4));
        expect(revoke).toHaveBeenCalledTimes(1);
    });
});

describe('pickSaveFile', () => {
    let input: HTMLInputElement;

    function fireChange(file: { name: string; arrayBuffer: () => Promise<ArrayBuffer> } | null) {
        Object.defineProperty(input, 'files', {
            value: file ? [file] : [],
            configurable: true,
        });
        input.onchange!(new Event('change'));
    }

    beforeEach(() => {
        document.body.innerHTML = '';
        pickSaveFile(vi.fn()); // create the singleton input
        input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
        expect(input).toBeTruthy();
        expect(input.accept).toBe('.sav');
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('does not open picker when canImport() returns false', () => {
        const onSelected = vi.fn();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        pickSaveFile(onSelected, { canImport: () => false });
        expect(warn).toHaveBeenCalled();
        expect(onSelected).not.toHaveBeenCalled();
    });

    it('delivers a valid 256-byte file to the callback', async () => {
        const data = Uint8Array.from({ length: SAVE_FILE_SIZE }, (_, i) => i % 256);
        const onSelected = vi.fn();
        pickSaveFile(onSelected);

        fireChange({ name: 'castle.sav', arrayBuffer: () => Promise.resolve(data.buffer) });
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        expect(onSelected).toHaveBeenCalledWith(data, 'castle.sav');
        expect(input.value).toBe(''); // reset after import
    });

    it('rejects wrong-sized payloads without invoking the callback', async () => {
        const onInvalid = vi.fn();
        const onSelected = vi.fn();
        pickSaveFile(onSelected, { onInvalid });

        fireChange({ name: 'bad.sav', arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)) });
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

        expect(onInvalid).toHaveBeenCalledWith('size');
        expect(onSelected).not.toHaveBeenCalled();
    });

    it('reports read/decode errors via onInvalid("error")', async () => {
        const onInvalid = vi.fn();
        pickSaveFile(vi.fn(), { onInvalid });

        fireChange({ name: 'broken.sav', arrayBuffer: () => Promise.reject(new Error('disk')) });
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

        expect(onInvalid).toHaveBeenCalledWith('error', expect.any(Error));
    });

    it('ignores cancel (no files selected)', () => {
        const onSelected = vi.fn();
        pickSaveFile(onSelected);
        fireChange(null);
        expect(onSelected).not.toHaveBeenCalled();
    });
});
