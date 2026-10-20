import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';
import DailyReviewCard from './DailyReviewCard';
import { fetchDailyReview } from '../../services/assistantApi';

vi.mock('../../services/assistantApi', () => ({ fetchDailyReview: vi.fn() }));

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

let container: HTMLDivElement;

const renderCard = async (path = '/activities') => {
    await act(async () => {
        ReactDOM.render(
            <MemoryRouter initialEntries={[path]}>
                <DailyReviewCard activities={[]} now={NOW} />
            </MemoryRouter>,
            container
        );
    });
};

const dialogText = () => document.querySelector('[role="dialog"]')?.textContent ?? null;

beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.mocked(fetchDailyReview).mockResolvedValue(REVIEW);
});

afterEach(() => {
    act(() => {
        ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
});

describe('DailyReviewCard', () => {
    it('pops up a new review once, then keeps it as a small notification on Home', async () => {
        await renderCard();
        expect(dialogText()).toContain('Thêm một cữ sữa buổi chiều.');
        expect(dialogText()).toContain('Bé bú 400ml.');
        // The reviewed day is spelled out, not just "yesterday".
        expect(dialogText()).toContain('20/10/2026');
        expect(container.textContent).toContain('20/10/2026');

        const gotIt = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Đã hiểu')!;
        await act(async () => {
            gotIt.click();
        });
        expect(localStorage.getItem('babytracker.dailyReviewSeen')).toBe('2026-10-20');
        expect(container.textContent).toContain(REVIEW.headline);

        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        await renderCard();
        await act(async () => undefined);
        expect(document.querySelector('[role="dialog"]')).toBeNull();
    });

    it('opens the popup again when coming from the push notification', async () => {
        localStorage.setItem('babytracker.dailyReviewSeen', '2026-10-20');
        await renderCard('/activities?review=1');
        expect(dialogText()).toContain(REVIEW.headline);
    });
});
