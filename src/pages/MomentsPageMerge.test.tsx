import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import '../i18n';
import i18n from '../i18n';
import MomentsPage from './MomentsPage';
import type { Moment, MomentPhoto } from '../firebase/moments';
import { mergeMoments } from '../firebase/moments';

const photo = (id: string): MomentPhoto => ({ id, driveFileId: `d-${id}`, width: 1, height: 1, size: 1, place: null, takenAt: null });
const moment = (id: string, date: string, photos: number): Moment => ({
    id, date, title: `T-${id}`, note: '', photos: Array.from({ length: photos }, (_, i) => photo(`${id}${i}`)),
    driveFolderId: `f-${id}`, location: null, legModes: {}, createdAt: `${date}T00:00:00Z`, updatedAt: ''
});

vi.mock('../hooks/useAuth', () => {
    const value = { user: { uid: 'u1' } };
    return { useAuth: () => value };
});
vi.mock('../hooks/useMoments', () => {
    const value = { moments: [] as Moment[], loading: false };
    return { useMoments: () => value, __value: value };
});
const openMoment = vi.fn();
vi.mock('../components/common/MomentSheets', () => ({ useMomentSheets: () => ({ openMoment, addMoment: () => {}, importPhotos: () => {}, sheets: null }) }));
vi.mock('../components/common/DrivePhoto', () => ({ default: () => null }));
vi.mock('../firebase/moments', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../firebase/moments')>();
    return { ...actual, mergeMoments: vi.fn(async (_uid: string, items: Moment[]) => items[0]) };
});

let container: HTMLDivElement;

const setMoments = async (items: Moment[]) => {
    const mod: any = await import('../hooks/useMoments');
    mod.__value.moments = items;
};

const render = () => act(() => {
    ReactDOM.render(<MemoryRouter><MomentsPage /></MemoryRouter>, container);
});

const click = (element: Element | null | undefined) => act(() => {
    (element as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

const buttonByText = (text: string) => Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes(text));

beforeEach(async () => {
    await i18n.changeLanguage('vi');
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
});

afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
    document.body.innerHTML = '';
});

describe('MomentsPage merge', () => {
    it('picks moments, confirms and merges them into one', async () => {
        await setMoments([moment('c', '2026-08-03', 2), moment('b', '2026-08-02', 3), moment('a', '2026-08-01', 1)]);
        render();
        click(buttonByText('Gộp'));
        expect(buttonByText('Chọn ít nhất 2')).toBeTruthy();

        const cards = () => Array.from(container.querySelectorAll('button[aria-pressed]'));
        expect(cards()).toHaveLength(3);
        click(cards()[1]);
        click(cards()[2]);
        expect(openMoment).not.toHaveBeenCalled();
        const next = buttonByText('Gộp 2 khoảnh khắc');
        expect(next?.textContent).toContain('4/30');
        click(next);

        // The confirm sheet starts with the earliest title and says what happens.
        const titleInput = document.querySelector('input') as HTMLInputElement;
        expect(titleInput.value).toBe('T-a');
        expect(document.body.textContent).toContain('2 khoảnh khắc sẽ thành 1');
        await act(async () => {
            buttonByText('Gộp thành 1')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(mergeMoments).toHaveBeenCalledWith('u1', expect.arrayContaining([expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })]), { title: 'T-a', note: '' }, expect.any(Function));
        expect(openMoment).toHaveBeenCalled();
    });

    it('blocks a merge with more photos than one moment holds', async () => {
        await setMoments([moment('b', '2026-08-02', 20), moment('a', '2026-08-01', 15)]);
        render();
        click(buttonByText('Gộp'));
        const cards = Array.from(container.querySelectorAll('button[aria-pressed]'));
        click(cards[0]);
        click(cards[1]);
        click(buttonByText('Gộp 2 khoảnh khắc'));
        expect(document.body.textContent).toContain('Tổng cộng 35 ảnh');
        expect((buttonByText('Gộp thành 1') as HTMLButtonElement).disabled).toBe(true);
    });
});
