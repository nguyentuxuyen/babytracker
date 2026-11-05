import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import '../i18n';
import TimelinePage from './TimelinePage';
import { firestore } from '../firebase/firestore';

const day = new Date(2026, 9, 31, 12, 0);
const milk = { id: 'milk-1', babyId: 'u1', type: 'feeding', timestamp: new Date(2026, 9, 31, 9, 15), details: { amount: 120, foodType: 'milk' } };
const meal = {
    id: 'meal-1', babyId: 'u1', type: 'feeding', timestamp: new Date(2026, 9, 31, 11, 0),
    details: { amount: 65, foodType: 'solid', foodItem: 'Cơm, Chuối', foodItems: ['Cơm', 'Chuối'], foodGrams: [50, 15], foodPreference: 'normal', notes: '' }
};

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('../contexts/BabyContext', () => ({ useBaby: () => ({ baby: { id: 'u1', name: 'Bé' } }) }));
vi.mock('../contexts/DateContext', () => ({ useDateContext: () => ({ selectedDate: day, setSelectedDate: vi.fn() }) }));
vi.mock('../hooks/useSleepTimer', () => ({ useSleepTimer: () => ({ ongoingSleep: null, elapsedSeconds: 0 }) }));
vi.mock('../components/common/RecentDaysStrip', () => ({ default: () => null }));
vi.mock('../firebase/firestore', () => ({
    firestore: {
        getActivitiesByDateRange: vi.fn(async () => [milk, meal]),
        deleteActivity: vi.fn(async () => true),
        updateActivity: vi.fn(async () => true)
    }
}));

let container: HTMLDivElement;
const deleteButton = () => container.querySelector('button[aria-label="Xoá bản ghi"]') as HTMLButtonElement;
const deleteButtons = () => container.querySelectorAll('button[aria-label="Xoá bản ghi"]');
const editButtonFor = (text: string) => {
    const buttons = [...container.querySelectorAll('button[aria-label="Sửa bản ghi"]')] as HTMLButtonElement[];
    return buttons.find((button) => {
        let node: HTMLElement | null = button;
        while (node && !node.textContent?.includes(text)) node = node.parentElement;
        return node && node.querySelectorAll('button[aria-label="Sửa bản ghi"]').length === 1;
    }) as HTMLButtonElement;
};
const setInput = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};
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

        expect(deleteButtons()).toHaveLength(1);
        expect(document.body.textContent).toContain('Hoàn tác');
    });
});

describe('TimelinePage edit of a solid-food meal', () => {
    it('edits the dishes and the grams of each one', async () => {
        act(() => editButtonFor('Cơm').click());
        const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
        const grams = (food: string) => dialog.querySelector(`input[aria-label="Lượng ${food} (g)"]`) as HTMLInputElement;
        expect(grams('Cơm').value).toBe('50');
        expect(grams('Chuối').value).toBe('15');

        // Remove banana, add avocado and give it its grams.
        const removeBanana = [...dialog.querySelectorAll('.MuiChip-root')]
            .find((chip) => chip.textContent === 'Chuối')!.querySelector('.MuiChip-deleteIcon') as SVGElement;
        act(() => { removeBanana.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        const foodInput = dialog.querySelector('input[placeholder]:not([type="number"]):not([type="time"])') as HTMLInputElement;
        act(() => setInput(foodInput, 'Bơ'));
        act(() => { foodInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
        act(() => setInput(grams('Bơ'), '20'));

        expect(dialog.textContent).toContain('Tổng 70g');
        await act(async () => dialogButton('Lưu').click());

        expect(firestore.updateActivity).toHaveBeenCalledWith('u1', 'meal-1', expect.objectContaining({
            details: expect.objectContaining({ foodItems: ['Cơm', 'Bơ'], foodItem: 'Cơm, Bơ', foodGrams: [50, 20], amount: 70 })
        }));
    });
});
