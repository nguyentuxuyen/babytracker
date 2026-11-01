import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import '../i18n';
import TimelinePage from './TimelinePage';
import { firestore } from '../firebase/firestore';

const day = new Date(2026, 9, 31, 12, 0);
const milk = { id: 'milk-1', babyId: 'u1', type: 'feeding', timestamp: new Date(2026, 9, 31, 9, 15), details: { amount: 120, foodType: 'milk' } };

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('../contexts/BabyContext', () => ({ useBaby: () => ({ baby: { id: 'u1', name: 'Bé' } }) }));
vi.mock('../contexts/DateContext', () => ({ useDateContext: () => ({ selectedDate: day, setSelectedDate: vi.fn() }) }));
vi.mock('../hooks/useSleepTimer', () => ({ useSleepTimer: () => ({ ongoingSleep: null, elapsedSeconds: 0 }) }));
vi.mock('../components/common/RecentDaysStrip', () => ({ default: () => null }));
vi.mock('../firebase/firestore', () => ({
    firestore: {
        getActivitiesByDateRange: vi.fn(async () => [milk]),
        deleteActivity: vi.fn(async () => true),
        updateActivity: vi.fn(async () => true)
    }
}));

let container: HTMLDivElement;
const deleteButton = () => container.querySelector('button[aria-label="Xoá bản ghi"]') as HTMLButtonElement;
const dialogButton = (text: string) =>
    [...document.querySelectorAll('[role="dialog"] button')].find((item) => item.textContent === text) as HTMLButtonElement;

beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        ReactDOM.render(<TimelinePage />, container);
    });
});

afterEach(() => {
    act(() => {
        ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
    vi.clearAllMocks();
});

describe('TimelinePage delete', () => {
    it('asks for confirmation and keeps the record when cancelled', async () => {
        act(() => deleteButton().click());

        expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Xoá bản ghi này?');
        await act(async () => dialogButton('Huỷ').click());

        expect(deleteButton()).not.toBeNull();
        expect(firestore.deleteActivity).not.toHaveBeenCalled();
    });

    it('removes the record only after the user confirms', async () => {
        act(() => deleteButton().click());
        await act(async () => dialogButton('Xoá bản ghi').click());

        expect(deleteButton()).toBeNull();
        expect(document.body.textContent).toContain('Hoàn tác');
    });
});
