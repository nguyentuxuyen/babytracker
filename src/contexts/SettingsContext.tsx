import React, { createContext, useContext } from 'react';
import type { FeedingSettings } from '../utils/feedingSettings';

// App-wide settings and their actions, owned by the app shell (App.tsx) and shown on the Settings page.
export interface AppSettings {
    reminderEnabled: boolean;
    reminderIntervalMinutes: number;
    notificationPermission: NotificationPermission | 'unsupported';
    pushSupported: boolean;
    pushEnabled: boolean;
    onToggleReminder: () => void;
    onChangeReminderInterval: (minutes: number) => void;
    onSendTestPush: () => void;
    onLanguageChange: () => void;
    onShowTranslations: () => void;
    feedingSettings: FeedingSettings;
    onChangeFeedingSettings: (settings: FeedingSettings) => void;
}

const SettingsContext = createContext<AppSettings | null>(null);

export const SettingsProvider: React.FC<{ value: AppSettings; children: React.ReactNode }> = ({ value, children }) => (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
);

export const useAppSettings = (): AppSettings | null => useContext(SettingsContext);

// For parts of the app outside the router (the header): change the URL and let the router follow.
export const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
};
