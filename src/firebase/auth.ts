import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    User,
    createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth } from './config';
import i18n from '../i18n';

export const loginUser = async (email: string, password: string): Promise<User> => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error: any) {
        // Handle Firebase auth errors with user-friendly messages
        let errorMessage = i18n.t('auth.loginFailed');
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = i18n.t('auth.userNotFound');
                break;
            case 'auth/wrong-password':
                errorMessage = i18n.t('auth.wrongPassword');
                break;
            case 'auth/invalid-email':
                errorMessage = i18n.t('auth.invalidEmail');
                break;
            case 'auth/user-disabled':
                errorMessage = i18n.t('auth.userDisabled');
                break;
            case 'auth/too-many-requests':
                errorMessage = i18n.t('auth.tooManyRequests');
                break;
            default:
                errorMessage = error.message;
        }
        
        throw new Error(errorMessage);
    }
};

export const registerUser = async (email: string, password: string): Promise<User> => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error: any) {
        // Handle Firebase auth errors with user-friendly messages
        let errorMessage = i18n.t('auth.registerFailed');
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = i18n.t('auth.emailInUse');
                break;
            case 'auth/invalid-email':
                errorMessage = i18n.t('auth.invalidEmail');
                break;
            case 'auth/operation-not-allowed':
                errorMessage = i18n.t('auth.registerDisabled');
                break;
            case 'auth/weak-password':
                errorMessage = i18n.t('auth.weakPassword');
                break;
            default:
                errorMessage = error.message;
        }
        
        throw new Error(errorMessage);
    }
};

export const logoutUser = async () => {
    try {
        await signOut(auth);
        console.log('Logout successful');
    } catch (error: any) {
        throw new Error(error.message);
    }
};

export const getCurrentUser = (): User | null => {
    return auth.currentUser;
};

export const subscribeToAuthState = (callback: (user: User | null) => void) => {
    return onAuthStateChanged(auth, callback);
};