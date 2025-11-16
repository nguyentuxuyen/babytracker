import { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';

export const useAuth = () => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        console.log('[useAuth] Setting up auth listener');
        const unsubscribe = onAuthStateChanged(
            auth,
            (user) => {
                console.log('[useAuth] Auth state changed:', user ? `User: ${user.email}` : 'No user');
                setUser(user);
                setLoading(false);
            },
            (error) => {
                console.error('[useAuth] Auth error:', error);
                setError(error);
                setLoading(false);
            }
        );

        return () => {
            console.log('[useAuth] Cleaning up auth listener');
            unsubscribe();
        };
    }, []);

    return {
        user,
        loading,
        error
    };
};

export default useAuth;