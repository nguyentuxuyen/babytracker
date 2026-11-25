import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';
import NotificationCenter, { HEADER_NOTIFICATION_SLOT_ID, useNotificationEntry } from './NotificationCenter';
import DailyReviewCard from './DailyReviewCard';
import { fetchDailyReview } from '../../services/assistantApi';
import {
    SharedNotificationState,
    saveNotificationDay,
    saveSeenNotifications,
    subscribeNotificationState
} from '../../firebase/notificationState';

vi.mock('../../services/assistantApi', () => ({ fetchDailyReview: vi.fn() }));
vi.mock('../../firebase/notificationState', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../firebase/notificationState')>()),
    subscribeNotificationState: vi.fn(),
    saveSeenNotifications: vi.fn(async () => undefined),
    saveNotificationDay: vi.fn(async () => undefined)
}));
vi.mock('../../firebase/config', () => ({ db: {}, auth: {} }));

const NOW = new Date(2026, 9, 21, 7, 30);
const REVIEW = {
    day: '2026-10-20',
    status: 'done' as const,
    language: 'vi',
    headline: 'Hôm qua bé ngủ đủ nhưng bú hơi ít.',
    facts: {
        ageMonths: 6.6,
        targets: { milkMinMl: 500, sleepMinHours: 12, sleepMaxHours: 16, solidMinMeals: 2 },
        yesterday: { milkMl: 400, milkFeeds: 4, solidGrams: 60, solidMeals: 1, sleepMinutes: 780, sleeps: 2, wetDiapers: 0, stools: 0 },
        status: { milk: 'low' as const, solids: 'low' as const, sleep: 'ok' as const }
    },
    ai: { headline: 'Hôm qua bé ngủ đủ nhưng bú hơi ít.', milk: 'Bé bú 400ml.', solids: 'Bé ăn 1 bữa.', sleep: 'Bé ngủ 13 giờ.', tips: ['Thêm một cữ sữa buổi chiều.'] }
};

const Item: React.FC<{ noticeKey: string }> = ({ noticeKey }) => {
    useNotificationEntry('item', { visible: true, key: noticeKey });
    return null;
};

let slot: HTMLDivElement;
let container: HTMLDivElement;
let pushRemote: (state: SharedNotificationState) => void;

const render = async (children: React.ReactNode) => {
    await act(async () => {
        ReactDOM.render(
            <MemoryRouter initialEntries={['/activities']}>
                <NotificationCenter userId="u1">{children}</NotificationCenter>
            </MemoryRouter>,
            container
        );
    });
};

const reviewPopup = () => [...document.querySelectorAll('[role="dialog"]')].find((node) => node.textContent?.includes('Đã hiểu')) ?? null;
const badge = () => slot.querySelector('button span')?.textContent ?? null;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(fetchDailyReview).mockResolvedValue(REVIEW);
    vi.mocked(subscribeNotificationState).mockImplementation((_uid, onChange) => {
        pushRemote = onChange;
        return () => undefined;
    });
    slot = document.createElement('div');
    slot.id = HEADER_NOTIFICATION_SLOT_ID;
    container = document.createElement('div');
    document.body.append(slot, container);
});

afterEach(() => {
    act(() => {
        ReactDOM.unmountComponentAtNode(container);
    });
    slot.remove();
    container.remove();
    vi.useRealTimers();
});

describe('notifications shared across devices', () => {
    it('does not pop up a review already seen on another device', async () => {
        await render(<DailyReviewCard activities={[]} now={NOW} />);
        // Waits for the account copy before deciding.
        expect(reviewPopup()).toBeNull();
        await act(async () => pushRemote({ seen: ['dailyReview:2026-10-20'], days: { dailyReviewSeen: '2026-10-20' } }));
        expect(reviewPopup()).toBeNull();
        // Still listed as a small row behind the bell.
        expect(document.body.textContent).toContain(REVIEW.headline);
        expect(badge()).toBeNull();
    });

    it('pops up a new review once and tells the other devices', async () => {
        await render(<DailyReviewCard activities={[]} now={NOW} />);
        await act(async () => pushRemote({ seen: [], days: {} }));
        expect(reviewPopup()?.textContent).toContain(REVIEW.headline);

        const gotIt = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Đã hiểu')!;
        await act(async () => {
            gotIt.click();
        });
        expect(saveNotificationDay).toHaveBeenCalledWith('u1', 'dailyReviewSeen', '2026-10-20');
        expect(saveSeenNotifications).toHaveBeenCalledWith('u1', ['dailyReview:2026-10-20']);
        expect(localStorage.getItem('babytracker.dailyReviewSeen')).toBe('2026-10-20');
    });

    it('falls back to this device when the account copy does not come', async () => {
        localStorage.setItem('babytracker.dailyReviewSeen', '2026-10-19');
        await render(<DailyReviewCard activities={[]} now={NOW} />);
        expect(reviewPopup()).toBeNull();
        await act(async () => {
            vi.advanceTimersByTime(5000);
        });
        expect(reviewPopup()?.textContent).toContain(REVIEW.headline);
    });

    it('keeps a day marked offline and sends it up', async () => {
        localStorage.setItem('babytracker.dailyReviewSeen', '2026-10-20');
        await render(<DailyReviewCard activities={[]} now={NOW} />);
        await act(async () => pushRemote({ seen: [], days: { dailyReviewSeen: '2026-10-19' } }));
        expect(reviewPopup()).toBeNull();
        expect(saveNotificationDay).toHaveBeenCalledWith('u1', 'dailyReviewSeen', '2026-10-20');
    });

    it('clears the bell badge when another device opened the notification', async () => {
        await render(<Item noticeKey="wake:1" />);
        await act(async () => pushRemote({ seen: [], days: {} }));
        expect(badge()).toBe('1');
        await act(async () => pushRemote({ seen: ['wake:1'], days: {} }));
        expect(badge()).toBeNull();
    });
});
