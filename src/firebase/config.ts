import { initializeApp } from 'firebase/app';
import { enableMultiTabIndexedDbPersistence, getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

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

// Initialize Firestore
export const db = getFirestore(firebaseApp);

enableMultiTabIndexedDbPersistence(db).catch((error) => {
    // Persistence is an enhancement; network reads remain available when unsupported.
    if (error?.code !== 'failed-precondition' && error?.code !== 'unimplemented') {
        console.warn('Firestore offline persistence unavailable:', error);
    }
});

// Initialize Authentication
export const auth = getAuth(firebaseApp);

export { firebaseApp };