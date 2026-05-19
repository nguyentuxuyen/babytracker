export interface ReminderSettings {
    enabled: boolean;
    intervalMinutes: number;
    lastReminderAt: string | null;
}

const SETTINGS_KEY = 'baby-tracker-reminder-settings';

const defaultSettings: ReminderSettings = {
    enabled: false,
    intervalMinutes: 180,
    lastReminderAt: null
};

export const loadReminderSettings = (): ReminderSettings => {
    if (typeof window === 'undefined') return defaultSettings;
    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (!raw) return defaultSettings;
        const parsed = JSON.parse(raw) as Partial<ReminderSettings>;
        return {
            enabled: Boolean(parsed.enabled),
            intervalMinutes: Number(parsed.intervalMinutes) > 0 ? Number(parsed.intervalMinutes) : defaultSettings.intervalMinutes,
            lastReminderAt: parsed.lastReminderAt || null
        };
    } catch (error) {
        console.error('Error loading reminder settings:', error);
        return defaultSettings;
    }
};

export const saveReminderSettings = (settings: ReminderSettings) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error('Error saving reminder settings:', error);
    }
};
