import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, reloadForNewVersion } from './lazyPage';

describe('isChunkLoadError', () => {
    it('spots page files that could not be loaded', () => {
        expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/TimelinePage-abc.js'))).toBe(true);
        expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
        expect(isChunkLoadError(new Error("Expected a JavaScript module script but the server responded with a MIME type of \"text/html\"."))).toBe(true);
        expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
    });

    it('leaves ordinary errors alone', () => {
        expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'getTime')"))).toBe(false);
        expect(isChunkLoadError(null)).toBe(false);
    });
});

describe('reloadForNewVersion', () => {
    const reload = vi.fn();
    const originalLocation = window.location;

    beforeEach(() => {
        window.sessionStorage.clear();
        reload.mockReset();
        Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload } });
    });
    afterEach(() => {
        Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    });

    it('reloads once, then not again within 30 seconds', () => {
        expect(reloadForNewVersion(1_000_000)).toBe(true);
        expect(reloadForNewVersion(1_010_000)).toBe(false);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('reloads again after the guard time', () => {
        reloadForNewVersion(1_000_000);
        expect(reloadForNewVersion(1_040_000)).toBe(true);
        expect(reload).toHaveBeenCalledTimes(2);
    });
});
