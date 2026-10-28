import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { MILK_TYPES, type MilkType } from '../domain/activitySchema.mjs';

// The milk the baby usually drinks, so feeds logged without a kind (form, Siri, assistant) still get one.
// Stored on the account so every phone and the server share it; cached locally for offline starts.
const STORAGE_KEY = 'babytracker.defaultMilkType';
export const DEFAULT_MILK_TYPE_EVENT = 'default-milk-type-changed';

const settingsDoc = (userId: string) => doc(db, 'users', userId, 'settings', 'feeding');

const asMilkType = (value: unknown): MilkType | null =>
    (MILK_TYPES as readonly string[]).includes(value as string) ? (value as MilkType) : null;

export const loadCachedDefaultMilkType = (): MilkType | null => {
    try {
        return asMilkType(localStorage.getItem(STORAGE_KEY));
    } catch {
        return null;
    }
};

const cache = (milkType: MilkType | null) => {
    try {
        if (milkType) localStorage.setItem(STORAGE_KEY, milkType);
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage unavailable: the account copy is still saved.
    }
    window.dispatchEvent(new CustomEvent(DEFAULT_MILK_TYPE_EVENT, { detail: milkType }));
};

export const loadDefaultMilkType = async (userId: string): Promise<MilkType | null> => {
    const snapshot = await getDoc(settingsDoc(userId));
    const milkType = asMilkType(snapshot.exists() ? snapshot.data().defaultMilkType : null);
    cache(milkType);
    return milkType;
};

export const saveDefaultMilkType = async (userId: string, milkType: MilkType | null) => {
    cache(milkType);
    await setDoc(settingsDoc(userId), { defaultMilkType: milkType, updatedAt: serverTimestamp() }, { merge: true });
};
