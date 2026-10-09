import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ja from './locales/ja.json';
import en from './locales/en.json';
import vi from './locales/vi.json';

export const SUPPORTED_LANGUAGES = [
    { code: 'ja', label: '日本語' },
    { code: 'en', label: 'English' },
    { code: 'vi', label: 'Tiếng Việt' }
] as const;

export type AppLanguage = typeof SUPPORTED_LANGUAGES[number]['code'];

export const DEFAULT_LANGUAGE: AppLanguage = 'ja';
export const LANGUAGE_STORAGE_KEY = 'babytracker.language';

const LOCALE_TAGS: Record<AppLanguage, string> = {
    ja: 'ja-JP',
    en: 'en-US',
    vi: 'vi-VN'
};

const isSupportedLanguage = (value: unknown): value is AppLanguage =>
    SUPPORTED_LANGUAGES.some((language) => language.code === value);

const readStoredLanguage = (): AppLanguage => {
    try {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        return isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
    } catch {
        return DEFAULT_LANGUAGE;
    }
};

export const currentLanguage = (): AppLanguage =>
    isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;

// BCP 47 tag for Intl / toLocale* formatting and speech recognition.
export const localeTag = (language: string = currentLanguage()): string =>
    LOCALE_TAGS[isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE];

export const changeLanguage = (language: AppLanguage) => i18n.changeLanguage(language);

i18n.on('languageChanged', (language) => {
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
        // Storage can be unavailable (private mode); the choice then lasts for this session only.
    }
    if (typeof document !== 'undefined') {
        document.documentElement.lang = language;
    }
});

i18n.use(initReactI18next).init({
    resources: {
        ja: { translation: ja },
        en: { translation: en },
        vi: { translation: vi }
    },
    lng: readStoredLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    returnNull: false,
    // Resources are bundled, so initialise synchronously and render translated text on first paint.
    initImmediate: false
});

if (typeof document !== 'undefined') {
    document.documentElement.lang = i18n.language;
}

export default i18n;
