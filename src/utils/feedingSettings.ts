import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { MILK_TYPES, type MilkType } from '../domain/activitySchema.mjs';

// The milk the baby drinks, set once in the menu: every milk feed (form, Siri, assistant) gets its kind,
// and the morning review judges the amount against that milk (product name, e.g. a formula brand).
// Stored on the account so every phone and the server share it; cached locally for offline starts.
export interface FeedingSettings {
    defaultMilkType: MilkType | null;
    milkProduct: string;
}

export const MAX_MILK_PRODUCT_LENGTH = 60;
const STORAGE_KEY = 'babytracker.feedingSettings';
export const DEFAULT_MILK_TYPE_EVENT = 'default-milk-type-changed';
const EMPTY: FeedingSettings = { defaultMilkType: null, milkProduct: '' };

const settingsDoc = (userId: string) => doc(db, 'users', userId, 'settings', 'feeding');

const clean = (raw: any): FeedingSettings => ({
    defaultMilkType: (MILK_TYPES as readonly string[]).includes(raw?.defaultMilkType) ? raw.defaultMilkType : null,
    milkProduct: typeof raw?.milkProduct === 'string' ? raw.milkProduct.trim().slice(0, MAX_MILK_PRODUCT_LENGTH) : ''
});

export const loadCachedFeedingSettings = (): FeedingSettings => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? clean(JSON.parse(raw)) : EMPTY;
    } catch {
        return EMPTY;
    }
};

export const loadCachedDefaultMilkType = (): MilkType | null => loadCachedFeedingSettings().defaultMilkType;

const cache = (settings: FeedingSettings) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // Storage unavailable: the account copy is still saved.
    }
    window.dispatchEvent(new CustomEvent(DEFAULT_MILK_TYPE_EVENT, { detail: settings.defaultMilkType }));
};

export const loadFeedingSettings = async (userId: string): Promise<FeedingSettings> => {
    const snapshot = await getDoc(settingsDoc(userId));
    const settings = clean(snapshot.exists() ? snapshot.data() : null);
    cache(settings);
    return settings;
};

export const saveFeedingSettings = async (userId: string, settings: FeedingSettings) => {
    const cleaned = clean(settings);
    cache(cleaned);
    await setDoc(settingsDoc(userId), { ...cleaned, updatedAt: serverTimestamp() }, { merge: true });
};
