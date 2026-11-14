import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { isChunkLoadError, lazyPage, reloadForNewVersion } from './lazyPage';

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

describe('lazyPage', () => {
    class Boundary extends React.Component<{ children?: React.ReactNode }, { failed: boolean }> {
        state = { failed: false };
        static getDerivedStateFromError() {
            return { failed: true };
        }
        render() {
            return this.state.failed ? 'failed' : this.props.children;
        }
    }

    it('tries to load the page again after a failure instead of failing forever', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const load = vi.fn()
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValue({ default: () => React.createElement('p', null, 'page') });
        const Page = lazyPage(load);
        const container = document.createElement('div');
        const show = async () => {
            await act(async () => {
                ReactDOM.render(
                    React.createElement(Boundary, { key: Math.random() },
                        React.createElement(React.Suspense, { fallback: 'loading' }, React.createElement(Page))),
                    container
                );
            });
            await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
        };

        await show();
        expect(container.textContent).toBe('failed');
        await show();
        expect(container.textContent).toBe('page');
        ReactDOM.unmountComponentAtNode(container);
    });
});
