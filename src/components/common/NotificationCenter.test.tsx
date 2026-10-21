import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import '../../i18n';
import NotificationCenter, { HEADER_NOTIFICATION_SLOT_ID, useNotificationEntry } from './NotificationCenter';

const Item: React.FC<{ name: string; noticeKey: string | null }> = ({ name, noticeKey }) => {
    useNotificationEntry(name, { visible: true, key: noticeKey });
    return <div data-testid={name}>{name}</div>;
};

let slot: HTMLDivElement;
let container: HTMLDivElement;

const render = (children: React.ReactNode) => {
    act(() => {
        ReactDOM.render(<NotificationCenter>{children}</NotificationCenter>, container);
    });
};

const bell = () => slot.querySelector('button') as HTMLButtonElement;
const badge = () => bell().querySelector('span')?.textContent ?? null;
// The list stays mounted (hidden) while closed, so look for the one that is showing.
const openList = () => document.querySelector('.MuiDialog-root:not([aria-hidden="true"]) [role="dialog"]');

beforeEach(() => {
    localStorage.clear();
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
});

describe('NotificationCenter', () => {
    it('puts a bell in the header that counts new notifications', () => {
        render(<><Item name="review" noticeKey="review:1" /><Item name="loading" noticeKey={null} /></>);
        expect(bell()).toBeTruthy();
        expect(badge()).toBe('1');
        // The items are not on the page until the bell is tapped.
        expect(openList()).toBeNull();
    });

    it('clears the badge once the list is opened, and remembers it', () => {
        render(<Item name="review" noticeKey="review:1" />);
        act(() => {
            bell().click();
        });
        expect(openList()?.textContent).toContain('review');
        expect(badge()).toBeNull();

        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        render(<Item name="review" noticeKey="review:1" />);
        expect(badge()).toBeNull();

        // New content under the same item counts again.
        render(<Item name="review" noticeKey="review:2" />);
        expect(badge()).toBe('1');
    });

    it('says so when there is nothing to show', () => {
        render(null);
        expect(badge()).toBeNull();
        act(() => {
            bell().click();
        });
        expect(openList()?.textContent).toContain('Chưa có thông báo nào');
    });
});
