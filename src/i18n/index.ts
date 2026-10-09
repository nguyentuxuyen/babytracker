import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ja from './locales/ja.json';
import en from './locales/en.json';
import vi from './locales/vi.json';

export const SUPPORTED_LANGUAGES = [
    { code: 'vi', label: 'Tiếng Việt' },
    { code: 'ja', label: '日本語' },
    { code: 'en', label: 'English' }
] as const;

export type AppLanguage = typeof SUPPORTED_LANGUAGES[number]['code'];

export const DEFAULT_LANGUAGE: AppLanguage = 'vi';
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
    // Copies, so runtime translation overrides never mutate the bundled JSON they reset from.
    resources: {
        ja: { translation: JSON.parse(JSON.stringify(ja)) },
        en: { translation: JSON.parse(JSON.stringify(en)) },
        vi: { translation: JSON.parse(JSON.stringify(vi)) }
    },
    lng: readStoredLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    returnNull: false,
    // Re-render when translation overrides are added at runtime.
    react: { bindI18nStore: 'added' },
    // Resources are bundled, so initialise synchronously and render translated text on first paint.
    initImmediate: false
});

if (typeof document !== 'undefined') {
    document.documentElement.lang = i18n.language;
}

export default i18n;
