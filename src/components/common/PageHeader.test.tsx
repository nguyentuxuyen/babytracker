import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';
import PageHeader, { PageHeaderSlotContext } from './PageHeader';

let container: HTMLDivElement;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
});

afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
});

describe('PageHeader', () => {
    it('shows the title on the page when there is no top bar', () => {
        act(() => {
            ReactDOM.render(<MemoryRouter><PageHeader title="Nhật ký" /></MemoryRouter>, container);
        });
        expect(container.querySelector('h1')?.textContent).toBe('Nhật ký');
    });

    it('moves the title into the top bar and tells the bar while it is shown', () => {
        const bar = document.createElement('div');
        const page = document.createElement('div');
        container.append(bar, page);
        let shown = 0;
        const slot = { element: bar, register: () => { shown += 1; return () => { shown -= 1; }; } };

        act(() => {
            ReactDOM.render(
                <MemoryRouter>
                    <PageHeaderSlotContext.Provider value={slot}>
                        <PageHeader back title="Cài đặt" subtitle="Sữa, nhắc nhở" />
                    </PageHeaderSlotContext.Provider>
                </MemoryRouter>,
                page
            );
        });
        expect(bar.querySelector('h1')?.textContent).toBe('Cài đặt');
        expect(bar.textContent).toContain('Sữa, nhắc nhở');
        expect(page.querySelector('h1')).toBeNull();
        expect(shown).toBe(1);

        act(() => { ReactDOM.unmountComponentAtNode(page); });
        expect(shown).toBe(0);
        expect(bar.querySelector('h1')).toBeNull();
    });
});
