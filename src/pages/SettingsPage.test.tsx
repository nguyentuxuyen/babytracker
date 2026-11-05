import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import '../i18n';
import SettingsPage from './SettingsPage';
import { SettingsProvider, type AppSettings } from '../contexts/SettingsContext';

let container: HTMLDivElement;

const settings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
    reminderEnabled: false,
    reminderIntervalMinutes: 180,
    notificationPermission: 'default',
    pushSupported: true,
    pushEnabled: false,
    onToggleReminder: vi.fn(),
    onChangeReminderInterval: vi.fn(),
    onSendTestPush: vi.fn(),
    onLanguageChange: vi.fn(),
    onShowTranslations: vi.fn(),
    feedingSettings: { defaultMilkType: 'formula', milkProduct: 'Meiji Hohoemi' },
    onChangeFeedingSettings: vi.fn(),
    ...overrides
});

const render = (value: AppSettings) => act(() => {
    ReactDOM.render(<SettingsProvider value={value}><SettingsPage /></SettingsProvider>, container);
});
const button = (text: string) => [...container.querySelectorAll('button')].find((item) => item.textContent === text)!;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
});

afterEach(() => {
    act(() => {
        ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
});

describe('SettingsPage', () => {
    it('sets the milk and the reminder interval', () => {
        const value = settings();
        render(value);

        expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Meiji Hohoemi');
        act(() => button('Sữa mẹ').click());
        expect(value.onChangeFeedingSettings).toHaveBeenCalledWith({ defaultMilkType: 'breast', milkProduct: 'Meiji Hohoemi' });

        act(() => button('2h').click());
        expect(value.onChangeReminderInterval).toHaveBeenCalledWith(120);
    });

    it('asks for the formula name only for formula', () => {
        render(settings({ feedingSettings: { defaultMilkType: 'breast', milkProduct: '' } }));
        expect(container.querySelector('input[type="text"]')).toBeNull();
    });
});
