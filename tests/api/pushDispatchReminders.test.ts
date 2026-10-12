// @vitest-environment node
import { call, createFakeDb, loadHandler, SERVER_TIMESTAMP, type FakeDb } from './harness';

const NOW = new Date('2026-10-12T12:00:00Z');
const minutesAgo = (minutes: number) => ({ toDate: () => new Date(NOW.getTime() - minutes * 60 * 1000) });
const cron = { authorization: 'Bearer cron-secret' };

let db: FakeDb;
let sent: Array<{ endpoint: string; payload: any }>;

const addSubscription = (uid: string, id: string, data: Record<string, unknown>) =>
    db.docs.set(`users/${uid}/pushSubscriptions/${id}`, { endpoint: `https://fcm.googleapis.com/${id}`, keys: {}, ...data });

const dispatch = (fakes: Parameters<typeof loadHandler>[1] = {}, headers = cron, method = 'POST') =>
    call(loadHandler('pushDispatchReminders.js', {
        db,
        sendNotification: async (subscription: any, payload: string) => {
            sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
            return { statusCode: 201 };
        },
        ...fakes
    }), { method, headers });

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('REMINDER_CRON_SECRET', '');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    db = createFakeDb();
    sent = [];
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('/api/pushDispatchReminders', () => {
    it('requires the cron secret', async () => {
        expect((await dispatch({}, { authorization: 'Bearer wrong' })).statusCode).toBe(401);
        expect((await dispatch({}, {} as any)).statusCode).toBe(401);
    });

    it('accepts GET (Vercel Cron) and refuses other methods', async () => {
        expect((await dispatch({}, cron, 'GET')).statusCode).toBe(200);
        expect((await dispatch({}, cron, 'DELETE')).statusCode).toBe(405);
    });

    it('fails with 500 without VAPID keys', async () => {
        expect((await dispatch({ vapidConfigured: false })).statusCode).toBe(500);
    });

    it('only reminds enabled subscriptions whose interval has passed, in their language', async () => {
        addSubscription('a', 'due', { enabled: true, intervalMinutes: 60, lastSentAt: minutesAgo(61), language: 'ja' });
        addSubscription('a', 'not-due', { enabled: true, intervalMinutes: 60, lastSentAt: minutesAgo(30) });
        addSubscription('b', 'disabled', { enabled: false, intervalMinutes: 60, lastSentAt: minutesAgo(600) });
        addSubscription('b', 'never-sent', { enabled: true });

        const res = await dispatch();

        expect(res.body).toEqual({ success: true, checked: 3, sent: 2, removed: 0 });
        expect(sent.map((s) => s.endpoint).sort()).toEqual(['https://fcm.googleapis.com/due', 'https://fcm.googleapis.com/never-sent']);
        expect(sent.find((s) => s.endpoint.endsWith('/due'))?.payload).toEqual({
            title: 'Baby Tracker リマインダー',
            body: '記録を更新する時間です 👶',
            url: '/activities'
        });
        expect(db.docs.get('users/a/pushSubscriptions/due')).toMatchObject({ lastSentAt: SERVER_TIMESTAMP });
        expect(db.docs.get('users/a/pushSubscriptions/not-due')?.lastSentAt).not.toBe(SERVER_TIMESTAMP);
    });

    it('defaults to a 3 hour interval', async () => {
        addSubscription('a', 'recent', { enabled: true, intervalMinutes: 0, lastSentAt: minutesAgo(179) });
        addSubscription('a', 'old', { enabled: true, lastSentAt: minutesAgo(180) });

        expect((await dispatch()).body).toMatchObject({ checked: 2, sent: 1 });
    });

    it('deletes subscriptions the push service says are gone and keeps ones that failed for other reasons', async () => {
        addSubscription('a', 'gone', { enabled: true });
        addSubscription('a', 'expired', { enabled: true });
        addSubscription('a', 'flaky', { enabled: true });
        const statusFor: Record<string, number> = { gone: 410, expired: 404, flaky: 500 };

        const res = await dispatch({
            sendNotification: async (subscription: any) => {
                throw Object.assign(new Error('push failed'), { statusCode: statusFor[subscription.endpoint.split('/').pop()] });
            }
        });

        expect(res.body).toEqual({ success: true, checked: 3, sent: 0, removed: 2 });
        expect([...db.docs.keys()]).toEqual(['users/a/pushSubscriptions/flaky']);
    });
});
