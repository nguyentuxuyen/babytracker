import type { Mock } from 'vitest';
import { call, createFakeDb, loadHandler } from './harness';

const AUTH = { authorization: 'Bearer good-token' };
const DOC = 'users/u1/driveAuth/google';

type Route = (url: string, init: any) => { status?: number; body?: unknown } | undefined;

// Google endpoints answered by `route`; every request is recorded.
const mockFetch = (route: Route) => {
    const fetchMock = vi.fn(async (url: string, init: any = {}) => {
        const answer = route(url, init) ?? { status: 404, body: {} };
        const status = answer.status ?? 200;
        return { ok: status >= 200 && status < 300, status, json: async () => answer.body ?? {} };
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock as Mock;
};

const formOf = (init: any) => Object.fromEntries(new URLSearchParams(init.body));

const setup = (env: Record<string, string> = { GOOGLE_OAUTH_CLIENT_ID: 'cid', GOOGLE_OAUTH_CLIENT_SECRET: 'csecret' }) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const db = createFakeDb();
    const handler = loadHandler('drive.js', { db, uid: 'u1' });
    return { db, handler, internal: (handler as any)._internal };
};

// Starts the flow like the app does and returns state + the cookie the browser keeps.
const startFlow = async (handler: any, returnTo = '/moments') => {
    const res = await call(handler, { headers: { ...AUTH, host: 'baby.example' }, body: { action: 'auth_url', returnTo } });
    const url = new URL(res.body.url);
    const cookie = res.headers['set-cookie'].split(';')[0];
    return { url, state: url.searchParams.get('state') as string, cookie };
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('drive api', () => {
    it('reports not configured without OAuth env vars', async () => {
        const { handler } = setup({ GOOGLE_OAUTH_CLIENT_ID: '', GOOGLE_OAUTH_CLIENT_SECRET: '' });
        expect((await call(handler, { headers: AUTH, body: { action: 'status' } })).body).toEqual({ configured: false, connected: false, folderId: null });
        expect((await call(handler, { headers: AUTH, body: { action: 'token' } })).statusCode).toBe(503);
    });

    it('requires a signed-in user', async () => {
        const { handler } = setup();
        expect((await call(handler, { body: { action: 'status' } })).statusCode).toBe(401);
    });

    it('builds a drive.file consent URL with a signed state and a browser cookie', async () => {
        const { handler } = setup();
        const { url, state, cookie } = await startFlow(handler);
        expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
        expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
        expect(url.searchParams.get('access_type')).toBe('offline');
        expect(url.searchParams.get('redirect_uri')).toBe('https://baby.example/api/drive');
        expect(state).toContain('.');
        expect(cookie).toMatch(/^drive_oauth=.+/);
    });

    it('stores an encrypted refresh token and creates the app folder on callback', async () => {
        const { db, handler, internal } = setup();
        const { state, cookie } = await startFlow(handler);
        const fetchMock = mockFetch((url, init) => {
            if (url === 'https://oauth2.googleapis.com/token') {
                expect(formOf(init)).toMatchObject({ code: 'abc', grant_type: 'authorization_code', redirect_uri: 'https://baby.example/api/drive' });
                return { body: { access_token: 'at', refresh_token: 'rt-secret', scope: 'https://www.googleapis.com/auth/drive.file' } };
            }
            if (url.startsWith('https://www.googleapis.com/drive/v3/files') && init.method === 'POST') {
                expect(JSON.parse(init.body)).toMatchObject({ mimeType: 'application/vnd.google-apps.folder' });
                return { body: { id: 'folder-1' } };
            }
            return undefined;
        });

        const res = await call(handler, { method: 'GET', headers: { host: 'baby.example', cookie }, query: { code: 'abc', state } });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('/moments?drive=connected');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const stored = db.docs.get(DOC)!;
        expect(stored.folderId).toBe('folder-1');
        expect(stored.refreshToken).not.toContain('rt-secret');
        expect(internal.decrypt(stored.refreshToken)).toBe('rt-secret');
    });

    it('rejects a callback without the cookie of the browser that started it', async () => {
        const { db, handler } = setup();
        const { state } = await startFlow(handler);
        const fetchMock = mockFetch(() => undefined);
        const res = await call(handler, { method: 'GET', headers: { host: 'baby.example', cookie: 'drive_oauth=other' }, query: { code: 'abc', state } });
        expect(res.headers.location).toBe('/settings?drive=error');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(db.docs.has(DOC)).toBe(false);
    });

    it('rejects tampered or expired state and unsafe return paths', async () => {
        const { internal } = setup();
        const state = internal.makeState('u1', '/x', 'n');
        expect(internal.readState(state)).toMatchObject({ uid: 'u1', nonce: 'n' });
        expect(internal.readState(state.replace(/^./, (c: string) => (c === 'a' ? 'b' : 'a')))).toBeNull();
        expect(internal.readState(internal.makeState('u1', '/x', 'n', Date.now() - 11 * 60 * 1000))).toBeNull();
        expect(internal.safeReturnTo('//evil.example')).toBe('/settings');
        expect(internal.safeReturnTo('https://evil.example')).toBe('/settings');
        expect(internal.safeReturnTo('/timeline')).toBe('/timeline');
    });

    it('returns to the app as cancelled when the user declines', async () => {
        const { handler } = setup();
        const { state, cookie } = await startFlow(handler, '/settings');
        const res = await call(handler, { method: 'GET', headers: { cookie }, query: { error: 'access_denied', state } });
        expect(res.headers.location).toBe('/settings?drive=cancelled');
    });

    it('mints access tokens from the stored refresh token', async () => {
        const { db, handler, internal } = setup();
        db.docs.set(DOC, { refreshToken: internal.encrypt('rt'), folderId: 'folder-1' });
        mockFetch((url, init) => {
            if (url === 'https://oauth2.googleapis.com/token') {
                expect(formOf(init)).toMatchObject({ refresh_token: 'rt', grant_type: 'refresh_token' });
                return { body: { access_token: 'fresh', expires_in: 3599 } };
            }
            if (url.includes('/files/folder-1')) return { body: { id: 'folder-1', trashed: false } };
            return undefined;
        });
        const res = await call(handler, { headers: AUTH, body: { action: 'token' } });
        expect(res.body).toEqual({ accessToken: 'fresh', expiresIn: 3599, folderId: 'folder-1' });
    });

    it('recreates the app folder when the user deleted it', async () => {
        const { db, handler, internal } = setup();
        db.docs.set(DOC, { refreshToken: internal.encrypt('rt'), folderId: 'gone' });
        mockFetch((url, init) => {
            if (url === 'https://oauth2.googleapis.com/token') return { body: { access_token: 'fresh', expires_in: 3600 } };
            if (url.includes('/files/gone')) return { body: { id: 'gone', trashed: true } };
            if (init.method === 'POST') return { body: { id: 'folder-2' } };
            return undefined;
        });
        const res = await call(handler, { headers: AUTH, body: { action: 'token' } });
        expect(res.body.folderId).toBe('folder-2');
        expect(db.docs.get(DOC)!.folderId).toBe('folder-2');
    });

    it('forgets a revoked connection', async () => {
        const { db, handler, internal } = setup();
        db.docs.set(DOC, { refreshToken: internal.encrypt('rt'), folderId: 'folder-1' });
        mockFetch(() => ({ status: 400, body: { error: 'invalid_grant' } }));
        const res = await call(handler, { headers: AUTH, body: { action: 'token' } });
        expect(res.statusCode).toBe(409);
        expect(db.docs.has(DOC)).toBe(false);
        expect((await call(handler, { headers: AUTH, body: { action: 'status' } })).body).toMatchObject({ configured: true, connected: false });
    });

    it('revokes and deletes on disconnect', async () => {
        const { db, handler, internal } = setup();
        db.docs.set(DOC, { refreshToken: internal.encrypt('rt'), folderId: 'folder-1' });
        const fetchMock = mockFetch((url) => (url === 'https://oauth2.googleapis.com/revoke' ? { body: {} } : undefined));
        expect((await call(handler, { headers: AUTH, body: { action: 'disconnect' } })).body).toEqual({ ok: true });
        expect(formOf(fetchMock.mock.calls[0][1])).toEqual({ token: 'rt' });
        expect(db.docs.has(DOC)).toBe(false);
    });
});
