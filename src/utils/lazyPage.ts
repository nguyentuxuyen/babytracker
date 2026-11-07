import React, { lazy } from 'react';

/**
 * Pages are separate JS files with a hash in their name. After a new release
 * the old files are gone from the server, and the service worker drops them
 * from its cache too. An app that was left open (often the case on a phone)
 * still points at the old names, so opening another page fails with
 * "Failed to fetch dynamically imported module" and the error screen shows.
 *
 * Two guards:
 * - every page file is fetched right after start-up (prefetchPages), so later
 *   navigation never needs the network;
 * - if a page file still fails to load, the app reloads once to pick up the
 *   new release instead of showing the error screen.
 */

const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (CSS )?chunk|ChunkLoadError|Unable to preload CSS|is not a valid JavaScript MIME type|text\/html/i;

export const isChunkLoadError = (error: unknown): boolean => {
    if (!error) return false;
    const name = (error as { name?: unknown }).name;
    if (name === 'ChunkLoadError') return true;
    const message = (error as { message?: unknown }).message ?? error;
    return CHUNK_ERROR.test(String(message));
};

const RELOAD_KEY = 'babytracker.chunkReloadAt';
const RELOAD_GUARD_MS = 30 * 1000;

/**
 * Reload the page to get the new release. Returns false (and does nothing) when
 * a reload for the same reason happened in the last 30 s, so a real outage
 * shows the error screen instead of reloading in a loop.
 */
export const reloadForNewVersion = (now: number = Date.now()): boolean => {
    try {
        const last = Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0;
        if (now - last < RELOAD_GUARD_MS) return false;
        window.sessionStorage.setItem(RELOAD_KEY, String(now));
    } catch {
        // No sessionStorage: still reload once per page load.
        if ((window as any).__babytrackerChunkReload) return false;
        (window as any).__babytrackerChunkReload = true;
    }
    window.location.reload();
    return true;
};

type PageModule = { default: React.ComponentType<any> };
const loaders: Array<() => Promise<unknown>> = [];

/** React.lazy for a page, with the reload-on-new-release guard. */
export const lazyPage = (load: () => Promise<PageModule>) => {
    loaders.push(() => load().catch(() => undefined));
    return lazy(async () => {
        try {
            return await load();
        } catch (error) {
            if (isChunkLoadError(error) && reloadForNewVersion()) {
                // Keep the spinner up while the page reloads.
                return new Promise<PageModule>(() => undefined);
            }
            throw error;
        }
    });
};

/** Fetch every page file once the browser is idle, so later navigation works offline and across releases. */
export const prefetchPages = () => {
    const run = () => loaders.forEach((load) => void load());
    const idle = (window as any).requestIdleCallback as ((cb: () => void, opts?: { timeout: number }) => void) | undefined;
    if (idle) idle(run, { timeout: 3000 });
    else window.setTimeout(run, 1500);
};
