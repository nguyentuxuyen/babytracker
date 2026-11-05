import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import '../i18n';
import DailyReviewsPage from './DailyReviewsPage';
import { fetchDailyReview, fetchDailyReviewHistory } from '../services/assistantApi';

vi.mock('../services/assistantApi', () => ({ fetchDailyReview: vi.fn(), fetchDailyReviewHistory: vi.fn() }));

const reviewOf = (day: string, headline: string, tip: string) => ({
    day,
    status: 'done' as const,
    language: 'vi',
    headline,
    facts: {
        ageMonths: 6.6,
        targets: { milkMinMl: 500, sleepMinHours: 12, sleepMaxHours: 16, solidMinMeals: 2 },
        yesterday: { milkMl: 400, milkFeeds: 4, solidGrams: 60, solidMeals: 1, sleepMinutes: 780, sleeps: 2, wetDiapers: 0, stools: 0 },
        status: { milk: 'low' as const, solids: 'low' as const, sleep: 'ok' as const }
    },
    ai: { headline, milk: 'Bé bú 400ml.', solids: 'Bé ăn 1 bữa.', sleep: 'Bé ngủ 13 giờ.', tips: [tip] }
});

let container: HTMLDivElement;
const buttons = (text: string) => [...container.querySelectorAll('button')].filter((button) => button.textContent === text);

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 21, 20));
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.mocked(fetchDailyReviewHistory).mockResolvedValue([
        reviewOf('2026-10-20', 'Hôm qua bú hơi ít.', 'Thêm một cữ sữa.'),
        reviewOf('2026-10-19', 'Ngày 19 ổn.', 'Giữ nhịp ngủ.')
    ]);
});

afterEach(() => {
    act(() => {
        ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
    vi.useRealTimers();
});

describe('DailyReviewsPage', () => {
    it('lists past reviews and writes one again', async () => {
        await act(async () => {
            ReactDOM.render(<DailyReviewsPage />, container);
        });

        // Newest day open, older ones folded to their headline.
        expect(container.textContent).toContain('Thêm một cữ sữa.');
        expect(container.textContent).toContain('Ngày 19 ổn.');
        expect(container.textContent).not.toContain('Giữ nhịp ngủ.');

        vi.mocked(fetchDailyReview).mockResolvedValue(reviewOf('2026-10-20', 'Viết lại: bú đủ.', 'Mới.'));
        await act(async () => {
            buttons('Đánh giá lại')[0].click();
        });

        expect(fetchDailyReview).toHaveBeenCalledWith(expect.objectContaining({ rewriteDay: '2026-10-20' }));
        expect(container.textContent).toContain('Viết lại: bú đủ.');
        expect(container.textContent).not.toContain('Hôm qua bú hơi ít.');
    });

    it('shows why a rewrite did not happen', async () => {
        await act(async () => {
            ReactDOM.render(<DailyReviewsPage />, container);
        });
        vi.mocked(fetchDailyReview).mockRejectedValue(new Error('AI đang bận'));

        await act(async () => {
            buttons('Đánh giá lại')[0].click();
        });

        expect(container.textContent).toContain('AI đang bận');
        expect(container.textContent).toContain('Hôm qua bú hơi ít.');
    });
});
