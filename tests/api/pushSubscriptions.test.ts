// @vitest-environment node
import { createRequire } from 'node:module';
import { call, createFakeDb, loadHandler, SERVER_TIMESTAMP, type FakeDb } from './harness';

const { subscriptionIdFor, legacySubscriptionIdFor } = createRequire(import.meta.url)('../../api/_subscriptions.js');

const UID = 'user-1';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
const auth = { authorization: 'Bearer good-token' };
const subscription = { endpoint: ENDPOINT, keys: { p256dh: 'p256', auth: 'secret' } };
const subPath = (id: string) => `users/${UID}/pushSubscriptions/${id}`;

let db: FakeDb;

beforeEach(() => {
    db = createFakeDb();
});

describe('POST /api/pushSubscribe', () => {
    const subscribe = (body: unknown, headers: Record<string, string> = auth) =>
        call(loadHandler('pushSubscribe.js', { db, uid: UID }), { headers, body });

    it('requires a signed-in user', async () => {
        expect((await subscribe({ subscription }, {})).statusCode).toBe(401);
    });

    it('rejects an incomplete subscription', async () => {
        expect((await subscribe({ subscription: { endpoint: ENDPOINT, keys: { p256dh: 'p' } } })).statusCode).toBe(400);
        expect((await subscribe({})).statusCode).toBe(400);
    });

    it.each([
        'http://fcm.googleapis.com/fcm/send/abc',
        'https://evil.example.com/push',
        'https://fcm.googleapis.com.evil.example/push',
        'not a url'
    ])('refuses push endpoint %s', async (endpoint) => {
        const res = await subscribe({ subscription: { ...subscription, endpoint } });
        expect(res.statusCode).toBe(400);
        expect(db.docs.size).toBe(0);
    });

    it('stores a new subscription with clamped interval, known language and a started reminder clock', async () => {
        const res = await subscribe({ subscription, intervalMinutes: 5, language: 'xx' });

        expect(res.statusCode).toBe(200);
        expect(res.body.subscriptionId).toBe(subscriptionIdFor(ENDPOINT));
        expect(db.docs.get(subPath(res.body.subscriptionId))).toEqual({
            uid: UID,
            endpoint: ENDPOINT,
            keys: { p256dh: 'p256', auth: 'secret' },
            enabled: true,
            intervalMinutes: 15,
            language: 'vi',
            updatedAt: SERVER_TIMESTAMP,
            createdAt: SERVER_TIMESTAMP,
            lastSentAt: SERVER_TIMESTAMP
        });
    });

    it('caps the interval at one day', async () => {
        const res = await subscribe({ subscription, intervalMinutes: 99999, language: 'ja' });
        expect(db.docs.get(subPath(res.body.subscriptionId))).toMatchObject({ intervalMinutes: 1440, language: 'ja' });
    });

    it('does not reset the reminder clock when settings change', async () => {
        const id = subscriptionIdFor(ENDPOINT);
        const lastSentAt = new Date('2026-10-12T00:00:00Z');
        db.docs.set(subPath(id), { endpoint: ENDPOINT, createdAt: 'original', lastSentAt, intervalMinutes: 180 });

        await subscribe({ subscription, intervalMinutes: 60, enabled: false });

        expect(db.docs.get(subPath(id))).toMatchObject({ createdAt: 'original', lastSentAt, intervalMinutes: 60, enabled: false });
    });

    it('removes the document stored under the old id scheme', async () => {
        db.docs.set(subPath(legacySubscriptionIdFor(ENDPOINT)), { endpoint: ENDPOINT });

        await subscribe({ subscription });

        expect([...db.docs.keys()]).toEqual([subPath(subscriptionIdFor(ENDPOINT))]);
    });
});

describe('POST /api/pushUnsubscribe', () => {
    const unsubscribe = (body: unknown, headers: Record<string, string> = auth) =>
        call(loadHandler('pushUnsubscribe.js', { db, uid: UID }), { headers, body });

    it('requires a signed-in user and an endpoint', async () => {
        expect((await unsubscribe({ endpoint: ENDPOINT }, {})).statusCode).toBe(401);
        expect((await unsubscribe({})).statusCode).toBe(400);
    });

    it('deletes both the current and legacy documents for the endpoint, and nothing else', async () => {
        db.docs.set(subPath(subscriptionIdFor(ENDPOINT)), { endpoint: ENDPOINT });
        db.docs.set(subPath(legacySubscriptionIdFor(ENDPOINT)), { endpoint: ENDPOINT });
        db.docs.set(subPath('other-device'), { endpoint: 'https://fcm.googleapis.com/fcm/send/other' });

        const res = await unsubscribe({ endpoint: ENDPOINT });

        expect(res.statusCode).toBe(200);
        expect([...db.docs.keys()]).toEqual([subPath('other-device')]);
    });
});
