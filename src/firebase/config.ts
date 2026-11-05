import { initializeApp } from 'firebase/app';
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    connectFirestoreEmulator
} from 'firebase/firestore';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyBtrEK-H3WIeq4xsasZGEoNmTfNvNu0-gk",
    authDomain: "baby-tracker-app-e7e1d.firebaseapp.com",
    projectId: "baby-tracker-app-e7e1d",
    storageBucket: "baby-tracker-app-e7e1d.firebasestorage.app",
    messagingSenderId: "224393169874",
    appId: "1:224393169874:web:8c25d1917c4dce37f2960b"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);

// Firestore with an IndexedDB cache shared by all open tabs: reads work offline and
// writes made offline are kept and sent when the network returns. Browsers without
// IndexedDB fall back to the memory cache automatically.
export const db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// Initialize Authentication
export const auth = getAuth(firebaseApp);

// Local end-to-end testing against the Firebase emulators (never set on Vercel).
if (import.meta.env.VITE_FIREBASE_EMULATORS === 'true') {
    connectFirestoreEmulator(db, '127.0.0.1', 8085);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

export { firebaseApp };