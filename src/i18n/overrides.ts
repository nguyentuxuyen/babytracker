import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import i18n, { AppLanguage, SUPPORTED_LANGUAGES } from './index';
import ja from './locales/ja.json';
import en from './locales/en.json';
import vi from './locales/vi.json';

// User edits to the bundled translations: language -> flat key ("nav.home") -> text.
export type TranslationOverrides = Partial<Record<AppLanguage, Record<string, string>>>;

const OVERRIDES_STORAGE_KEY = 'babytracker.translationOverrides';
const BASE_RESOURCES: Record<AppLanguage, Record<string, unknown>> = { ja, en, vi };

const overridesDoc = (userId: string) => doc(db, 'users', userId, 'settings', 'translations');

// Flat string entries of a bundled language. Array content (Wonder Weeks skills) is not editable.
export const baseTranslations = (language: AppLanguage): Record<string, string> => {
    const result: Record<string, string> = {};
    const walk = (value: unknown, prefix: string) => {
        if (typeof value === 'string') {
            result[prefix] = value;
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.entries(value as Record<string, unknown>).forEach(([key, child]) =>
                walk(child, prefix ? `${prefix}.${key}` : key));
        }
    };
    walk(BASE_RESOURCES[language], '');
    return result;
};

// Keep only known keys with a non-empty text that differs from the bundled one.
export const cleanOverrides = (overrides: TranslationOverrides): TranslationOverrides => {
    const cleaned: TranslationOverrides = {};
    SUPPORTED_LANGUAGES.forEach(({ code }) => {
        const base = baseTranslations(code);
        const entries = Object.entries(overrides[code] || {})
            .filter(([key, text]) => key in base && typeof text === 'string' && text.trim() !== '' && text !== base[key]);
        if (entries.length > 0) cleaned[code] = Object.fromEntries(entries);
    });
    return cleaned;
};

let currentOverrides: TranslationOverrides = {};

export const getTranslationOverrides = (): TranslationOverrides => currentOverrides;

const unflatten = (flat: Record<string, string>) => {
    const result: Record<string, unknown> = {};
    Object.entries(flat).forEach(([key, text]) => {
        const parts = key.split('.');
        let node = result;
        parts.slice(0, -1).forEach((part) => {
            node[part] = (node[part] as Record<string, unknown>) || {};
            node = node[part] as Record<string, unknown>;
        });
        node[parts[parts.length - 1]] = text;
    });
    return result;
};

// Reset every language to the bundled text, then lay the overrides on top.
export const applyTranslationOverrides = (overrides: TranslationOverrides) => {
    currentOverrides = cleanOverrides(overrides);
    SUPPORTED_LANGUAGES.forEach(({ code }) => {
        i18n.addResourceBundle(code, 'translation', BASE_RESOURCES[code], true, true);
        const flat = currentOverrides[code];
        if (flat) i18n.addResourceBundle(code, 'translation', unflatten(flat), true, true);
    });
    try {
        localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(currentOverrides));
    } catch {
        // Storage unavailable: overrides still apply for this session.
    }
};

export const applyCachedTranslationOverrides = () => {
    try {
        const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
        if (raw) applyTranslationOverrides(JSON.parse(raw));
    } catch {
        // Ignore a corrupt cache; the account copy is loaded after login.
    }
};

export const loadTranslationOverrides = async (userId: string) => {
    const snapshot = await getDoc(overridesDoc(userId));
    const overrides = snapshot.exists() ? (snapshot.data().overrides as TranslationOverrides | undefined) : undefined;
    applyTranslationOverrides(overrides || {});
};

export const saveTranslationOverrides = async (userId: string, overrides: TranslationOverrides) => {
    applyTranslationOverrides(overrides);
    await setDoc(overridesDoc(userId), { overrides: currentOverrides, updatedAt: serverTimestamp() });
};
