import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    User,
    createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth } from './config';

export const loginUser = async (email: string, password: string): Promise<User> => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error: any) {
        // Handle Firebase auth errors with user-friendly messages
        let errorMessage = 'Đăng nhập thất bại';
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'Tài khoản không tồn tại';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Mật khẩu không đúng';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Email không hợp lệ';
                break;
            case 'auth/user-disabled':
                errorMessage = 'Tài khoản đã bị khóa';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Quá nhiều lần thử. Vui lòng thử lại sau';
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
        let errorMessage = 'Đăng ký thất bại';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'Email đã được sử dụng';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Email không hợp lệ';
                break;
            case 'auth/operation-not-allowed':
                errorMessage = 'Chức năng đăng ký đã bị tắt';
                break;
            case 'auth/weak-password':
                errorMessage = 'Mật khẩu quá yếu';
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