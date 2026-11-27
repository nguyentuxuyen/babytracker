import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import i18n from '../../i18n';
import SpecialDayCelebration from './SpecialDayCelebration';

const BABY = { name: 'Bơ', birthDate: new Date(2025, 6, 23) };

let container: HTMLDivElement;

// jsdom has no canvas: the confetti just skips drawing.
beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;
});

const render = async (now: Date, onAddMoment?: () => void) => {
    await act(async () => {
        ReactDOM.render(<SpecialDayCelebration baby={BABY} now={now} onAddMoment={onAddMoment} />, container);
    });
};

const buttonWithText = (text: string) =>
    Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes(text));

beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('vi');
    container = document.createElement('div');
    document.body.appendChild(container);
});

afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    document.body.innerHTML = '';
});

describe('SpecialDayCelebration', () => {
    it('shows nothing on an ordinary day', async () => {
        await render(new Date(2026, 10, 22, 8));
        expect(document.body.textContent).not.toContain('Chúc mừng');
    });

    it('pops up once on the monthly day with the age', async () => {
        await render(new Date(2026, 10, 23, 8));
        expect(document.body.textContent).toContain('Chúc mừng Bơ tròn 16 tháng!');
        expect(document.body.textContent).toContain('1 tuổi 4 tháng');
        expect(document.body.textContent).toContain('488 ngày Bơ ở bên bố mẹ');
        expect(document.querySelector('[data-testid="celebration-confetti"]')).not.toBeNull();

        await act(async () => { buttonWithText('Cảm ơn!')!.click(); });
        expect(window.localStorage.getItem('babytracker.celebrationSeen')).toBe('2026-11-23');

        // Opening the app again the same day: only the row in the bell list, which replays it.
        ReactDOM.unmountComponentAtNode(container);
        await render(new Date(2026, 10, 23, 15));
        expect(document.body.textContent).toContain('Hôm nay Bơ tròn 16 tháng');
        expect(document.body.textContent).not.toContain('Chúc mừng Bơ tròn 16 tháng!');
        await act(async () => { (container.querySelector('[role="button"]') as HTMLElement).click(); });
        expect(document.body.textContent).toContain('Chúc mừng Bơ tròn 16 tháng!');
    });

    it('celebrates the birthday and can open the moment editor', async () => {
        const onAddMoment = vi.fn();
        await render(new Date(2026, 6, 23, 8), onAddMoment);
        expect(document.body.textContent).toContain('Chúc mừng Bơ thôi nôi, tròn 1 tuổi!');
        await act(async () => { buttonWithText('Lưu khoảnh khắc')!.click(); });
        expect(onAddMoment).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem('babytracker.celebrationSeen')).toBe('2026-07-23');
    });
});
