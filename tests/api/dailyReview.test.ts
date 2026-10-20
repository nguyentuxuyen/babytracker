// @vitest-environment node
import { call, createFakeDb, loadHandler, type FakeDb } from './harness';

const UID = 'parent';
const auth = { authorization: 'Bearer good-token' };
const cron = { authorization: 'Bearer cron-secret' };
// Times are Japan time (UTC+9), like the family's phones.
const jst = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2026, 9, day, hour - 9, minute));

const AI_REVIEW = {
    headline: 'Hôm qua bé ngủ đủ nhưng bú và ăn dặm hơi ít.',
    milk: 'Bé bú 400ml, dưới mức 500ml.',
    solids: 'Bé ăn 1 bữa, nên 2 bữa.',
    sleep: 'Bé ngủ 13 giờ, trong khoảng khuyến nghị.',
    tips: ['Thêm một cữ sữa buổi chiều.', 'Thêm bữa ăn dặm buổi trưa.']
};

let db: FakeDb;
let sent: Array<{ endpoint: string; payload: any }>;
let fetchMock: ReturnType<typeof vi.fn>;
let autoId = 0;

const addActivity = (type: string, timestamp: Date, details: Record<string, unknown>) =>
    db.docs.set(`users/${UID}/activities/a${++autoId}`, { babyId: UID, type, timestamp, details });

// Yesterday (20/10): milk 4 × 100ml (low for 6 months), one solid meal (low), 13 h of sleep (ok).
const logYesterday = () => {
    for (const hour of [7, 11, 15, 19]) addActivity('feeding', jst(20, hour), { foodType: 'milk', amount: 100 });
    addActivity('feeding', jst(20, 12), { foodType: 'solid', amount: 60, foodItem: 'cháo' });
    addActivity('sleep', jst(20, 6), { duration: 600 });
    addActivity('sleep', jst(20, 14), { duration: 180 });
};

const dispatch = () => call(loadHandler('pushDispatchReminders.js', {
    db,
    sendNotification: async (subscription: any, payload: string) => {
        sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
        return { statusCode: 201 };
    }
}), { headers: cron });

const reviews = () => sent.filter((s) => s.payload.title.startsWith('Đánh giá'));
const reviewDoc = () => db.docs.get(`users/${UID}/dailyReviews/2026-10-20`);

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(jst(21, 7, 30));
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('REMINDER_CRON_SECRET', '');
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock = vi.fn(async () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(AI_REVIEW) }] } }] })
    }));
    vi.stubGlobal('fetch', fetchMock);
    db = createFakeDb();
    sent = [];
    // Born 1/4: about 6.6 months old on 20/10.
    db.docs.set(`babies/${UID}`, { name: 'Bin', birthDate: new Date(Date.UTC(2026, 2, 31, 15)), gender: 'male' });
    // Reminders were just sent, so only the review can go out.
    db.docs.set(`users/${UID}/pushSubscriptions/phone`, {
        uid: UID,
        endpoint: 'https://fcm.googleapis.com/phone',
        keys: {},
        enabled: true,
        language: 'vi',
        utcOffsetMinutes: 540,
        intervalMinutes: 180,
        lastSentAt: { toDate: () => new Date(Date.now() - 10 * 60 * 1000) }
    });
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('morning review from the reminder cron', () => {
    it('waits for the wake-up, then sends the AI review once', async () => {
        logYesterday();

        expect((await dispatch()).body).toMatchObject({ reviews: 0 });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(reviewDoc()).toBeUndefined();

        // Night waking at 03:00 does not count; the 06:45 wake-up does.
        addActivity('sleep', jst(21, 3), { duration: 240 });
        expect((await dispatch()).body).toMatchObject({ reviews: 0 });
        addActivity('sleep', jst(21, 6, 45), { duration: 180 });
        expect((await dispatch()).body).toMatchObject({ reviews: 1 });

        expect(reviews()).toEqual([{
            endpoint: 'https://fcm.googleapis.com/phone',
            payload: { title: 'Đánh giá ngày hôm qua 🌤️', body: AI_REVIEW.headline, url: '/activities' }
        }]);
        expect(reviewDoc()).toMatchObject({
            status: 'done',
            trigger: 'wakeUp',
            ai: AI_REVIEW,
            facts: {
                day: '2026-10-20',
                targets: { milkMinMl: 500, sleepMinHours: 12, sleepMaxHours: 16, solidMinMeals: 2 },
                yesterday: { milkMl: 400, milkFeeds: 4, solidMeals: 1, solidGrams: 60, sleepMinutes: 780, sleeps: 2 },
                status: { milk: 'low', solids: 'low', sleep: 'ok' }
            }
        });
        const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
        expect(prompt).toContain('in Vietnamese');
        expect(prompt).not.toContain('cháo');
        expect(db.docs.get(`users/${UID}/usage/assistant`)).toMatchObject({ count: 1 });

        await dispatch();
        expect(reviews()).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('sends it at 9:00 even when no wake-up was logged', async () => {
        logYesterday();
        vi.setSystemTime(jst(21, 9, 5));

        expect((await dispatch()).body).toMatchObject({ reviews: 1 });
        expect(reviewDoc()).toMatchObject({ trigger: 'fallback' });
    });

    it('sends nothing in the afternoon', async () => {
        logYesterday();
        vi.setSystemTime(jst(21, 13));

        expect((await dispatch()).body).toMatchObject({ reviews: 0 });
        expect(reviewDoc()).toBeUndefined();
    });

    it('skips a day with nothing logged, without retrying every run', async () => {
        vi.setSystemTime(jst(21, 9, 5));

        await dispatch();
        await dispatch();

        expect(reviewDoc()).toMatchObject({ status: 'empty' });
        expect(reviews()).toHaveLength(0);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('falls back to the app’s own summary when the AI fails', async () => {
        logYesterday();
        vi.setSystemTime(jst(21, 9, 5));
        fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'busy' });

        await dispatch();

        expect(reviews()[0].payload.body).toBe('sữa thiếu · ăn dặm thiếu · ngủ đủ');
        expect(reviewDoc()).toMatchObject({ status: 'done', ai: null });
    });
});

describe('POST /api/mcp daily_review', () => {
    const request = (body: Record<string, unknown>) =>
        call(loadHandler('mcp.js', {
            db,
            uid: UID,
            sendNotification: async (subscription: any, payload: string) => {
                sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
                return { statusCode: 201 };
            }
        }), { headers: auth, body: { action: 'daily_review', language: 'en', utcOffsetMinutes: 540, ...body } });

    it('returns null until the review is written', async () => {
        logYesterday();
        const res = await request({});
        expect(res.body).toEqual({ success: true, tool: 'daily_review', review: null });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('writes it on request with the parents’ own minimums, and notifies in the morning', async () => {
        logYesterday();

        const res = await request({ generate: true, settings: { milkMinMl: 350, sleepMinHours: null } });

        expect(res.statusCode).toBe(200);
        expect(res.body.review).toMatchObject({
            day: '2026-10-20',
            status: 'done',
            language: 'en',
            headline: AI_REVIEW.headline,
            facts: { status: { milk: 'ok', solids: 'low', sleep: 'ok' } }
        });
        expect(db.docs.get(`users/${UID}/settings/dailyTargets`)).toMatchObject({ milkMinMl: 350, sleepMinHours: null });
        expect(reviews()).toHaveLength(1);

        // Asking again returns the same review without another AI call.
        const again = await request({ generate: true });
        expect(again.body.review.headline).toBe(AI_REVIEW.headline);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not notify when written in the evening', async () => {
        logYesterday();
        vi.setSystemTime(jst(21, 20));

        await request({ generate: true });

        expect(reviewDoc()).toMatchObject({ status: 'done' });
        expect(reviews()).toHaveLength(0);
    });

    it('retries the AI part without notifying again', async () => {
        logYesterday();
        fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'busy' });

        const first = await request({ generate: true });
        expect(first.body.review).toMatchObject({ ai: null, headline: 'milk low · solids low · sleep enough' });

        const retried = await request({ generate: true, retryAi: true });
        expect(retried.body.review.ai).toEqual(AI_REVIEW);
        expect(reviews()).toHaveLength(1);
        expect(reviewDoc()?.pushedAt).toBeTruthy();
    });
});
