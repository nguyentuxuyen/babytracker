import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import '../i18n';
import ActivitiesPage from './ActivitiesPageNew';
import { firestore } from '../firebase/firestore';

vi.mock('../hooks/useAuth', () => {
    const value = { user: { uid: 'u1' } };
    return { useAuth: () => value };
});
vi.mock('../contexts/BabyContext', () => {
    // Stable values: a fresh object per render would re-run the page's effects forever.
    const value = { baby: { id: 'u1', name: 'Bé', birthDate: new Date(2026, 0, 1) }, activities: [], refreshActivities: () => {} };
    return { useBaby: () => value };
});
vi.mock('../contexts/DateContext', () => {
    const value = { selectedDate: new Date(), setSelectedDate: () => {} };
    return { useDateContext: () => value };
});
vi.mock('../hooks/useSleepTimer', () => ({ useSleepTimer: () => ({ ongoingSleep: null, elapsedSeconds: 0, setOngoingSleep: () => {} }) }));
vi.mock('../hooks/useMoments', () => {
    const value = { moments: [], loading: false };
    return { useMoments: () => value };
});
vi.mock('../components/common/MomentSheets', () => ({ useMomentSheets: () => ({ addMoment: () => {}, sheets: null }) }));
vi.mock('../components/common/RecentDaysStrip', () => ({ default: () => null }));
vi.mock('../components/common/DayStatsCard', () => ({ default: () => null }));
vi.mock('../components/common/YesterdayCheckCard', () => ({ default: () => null }));
vi.mock('../components/common/DailyReviewCard', () => ({ default: () => null }));
vi.mock('../components/common/InstallAppCard', () => ({ default: () => null }));
vi.mock('../components/common/RecentActivityList', () => ({ default: () => null }));
vi.mock('../components/common/AssistantComposer', () => ({ AssistantComposer: () => null }));
vi.mock('../firebase/firestore', () => {
    let n = 0;
    return {
        firestore: {
            getActivitiesByDateRange: vi.fn(async () => []),
            getActivities: vi.fn(async () => []),
            getFoodItems: vi.fn(async () => []),
            getOngoingSleep: vi.fn(async () => null),
            isPendingWrite: vi.fn(() => false),
            saveActivity: vi.fn(async (_uid: string, data: any) => ({ ...data, id: `a${++n}` })),
            subscribeToActivities: vi.fn(() => () => {})
        }
    };
});

let container: HTMLDivElement;
const byText = (text: string, selector = 'button, [role="radio"], div') =>
    [...document.querySelectorAll(selector)].reverse().find((el) => el.textContent?.trim() === text) as HTMLElement;

beforeEach(async () => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        ReactDOM.render(<MemoryRouter><ActivitiesPage /></MemoryRouter>, container);
    });
});

afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
    vi.clearAllMocks();
});

const openBath = async () => {
    // The quick-action tile: its label bubbles the tap up to the tile.
    const label = [...container.querySelectorAll('*')].find((el) => el.children.length === 0 && el.textContent?.trim() === 'Tắm') as HTMLElement;
    await act(async () => { label.click(); });
};
const save = async () => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'Lưu' || el.getAttribute('type') === 'submit') as HTMLButtonElement;
    await act(async () => { button.click(); });
};

describe('bath with a diaper change', () => {
    it('logs a bath and a wet diaper at the same time by default', async () => {
        await openBath();
        expect(document.body.textContent).toContain('Thay tã luôn');
        await save();

        const calls = vi.mocked(firestore.saveActivity).mock.calls.map(([, data]) => data as any);
        expect(calls.map((c) => c.type).sort()).toEqual(['bath', 'diaper']);
        const diaper = calls.find((c) => c.type === 'diaper');
        const bath = calls.find((c) => c.type === 'bath');
        expect(diaper.details).toMatchObject({ isUrine: true, isStool: false });
        expect(diaper.timestamp.getTime()).toBe(bath.timestamp.getTime());
        expect(localStorage.getItem('babytracker.bathDiaperKind')).toBe('urine');
    });

    it('logs only the bath when "Không" is picked, and remembers it', async () => {
        await openBath();
        await act(async () => { byText('Không', '[role="radio"], button').click(); });
        await save();

        const calls = vi.mocked(firestore.saveActivity).mock.calls.map(([, data]) => data as any);
        expect(calls.map((c) => c.type)).toEqual(['bath']);
        expect(localStorage.getItem('babytracker.bathDiaperKind')).toBe('none');
    });
});
