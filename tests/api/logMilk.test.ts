// @vitest-environment node
import { call, createFakeDb, loadHandler, SERVER_TIMESTAMP, type FakeDb } from './harness';

const UID = 'baby-owner';
const SECRET = 'log-secret';

let db: FakeDb;
let handler: ReturnType<typeof loadHandler>;

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('LOG_SECRET', SECRET);
    vi.stubEnv('SERVICE_ACCOUNT_USER_UID', UID);
    db = createFakeDb();
    handler = loadHandler('logMilk.js', { db });
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

const withSecret = { 'x-log-secret': SECRET };
const savedActivities = () => [...db.docs.entries()].filter(([p]) => p.startsWith(`users/${UID}/activities/`));

describe('POST /api/logMilk', () => {
    it('rejects other methods', async () => {
        expect((await call(handler, { method: 'GET', headers: withSecret })).statusCode).toBe(405);
    });

    it('rejects a missing or wrong secret', async () => {
        expect((await call(handler, { body: { amountMl: 120 } })).statusCode).toBe(401);
        expect((await call(handler, { headers: { 'x-log-secret': 'nope' }, body: { amountMl: 120 } })).statusCode).toBe(401);
        expect(savedActivities()).toHaveLength(0);
    });

    it('accepts the secret as a bearer token too', async () => {
        const res = await call(handler, { headers: { authorization: `Bearer ${SECRET}` }, body: { amountMl: 120 } });
        expect(res.statusCode).toBe(200);
    });

    it('fails with 500 when the server has no target user configured', async () => {
        vi.stubEnv('SERVICE_ACCOUNT_USER_UID', '');
        expect((await call(handler, { headers: withSecret, body: { amountMl: 120 } })).statusCode).toBe(500);
    });

    it('fails with 500 when Firebase Admin did not initialize', async () => {
        handler = loadHandler('logMilk.js', { db: null });
        expect((await call(handler, { headers: withSecret, body: { amountMl: 120 } })).statusCode).toBe(500);
    });

    it.each([undefined, 0, -10, 'abc'])('rejects amountMl=%s', async (amountMl) => {
        const res = await call(handler, { headers: withSecret, body: { amountMl } });
        expect(res.statusCode).toBe(400);
        expect(savedActivities()).toHaveLength(0);
    });

    it('rejects an amount the schema considers absurd', async () => {
        const res = await call(handler, { headers: withSecret, body: { amountMl: 99999 } });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Invalid activity');
    });

    it('saves a milk feed for the configured user with notes and a server createdAt', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-12T03:00:00Z'));

        const res = await call(handler, { headers: withSecret, body: { amountMl: '150', note: ' from Siri ' } });

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ success: true, amountMl: 150 });
        const [[docPath, saved]] = savedActivities();
        expect(docPath).toBe(`users/${UID}/activities/${res.body.id}`);
        expect(saved).toEqual({
            babyId: UID,
            type: 'feeding',
            timestamp: new Date('2026-10-12T03:00:00Z'),
            details: { foodType: 'milk', amount: 150, notes: 'from Siri' },
            schemaVersion: 1,
            createdAt: SERVER_TIMESTAMP
        });
    });

    it('tags the feed with the milk set in the menu', async () => {
        db.docs.set(`users/${UID}/settings/feeding`, { defaultMilkType: 'formula' });

        await call(handler, { headers: withSecret, body: { amountMl: 120 } });

        expect(savedActivities()[0][1].details).toMatchObject({ foodType: 'milk', amount: 120, milkType: 'formula' });
    });

    it('reads a timestamp without an offset in the given offset, defaulting to JST', async () => {
        const jst = await call(handler, { headers: withSecret, body: { amountMl: 100, timestamp: '2026-10-12T08:30' } });
        const vietnam = await call(handler, { headers: withSecret, body: { amountMl: 100, timestamp: '2026-10-12T08:30', utcOffsetMinutes: 420 } });
        const explicit = await call(handler, { headers: withSecret, body: { amountMl: 100, timestamp: '2026-10-12T08:30:00Z' } });

        expect(new Date(jst.body.timestamp).toISOString()).toBe('2026-10-11T23:30:00.000Z');
        expect(new Date(vietnam.body.timestamp).toISOString()).toBe('2026-10-12T01:30:00.000Z');
        expect(new Date(explicit.body.timestamp).toISOString()).toBe('2026-10-12T08:30:00.000Z');
    });
});
