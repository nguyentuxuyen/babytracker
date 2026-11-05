import { useEffect, useState } from 'react';
import { Moment, subscribeMoments } from '../firebase/moments';

// Live list of the user's moments, newest event first.
export const useMoments = (uid?: string | null) => {
    const [moments, setMoments] = useState<Moment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!uid) {
            setMoments([]);
            return undefined;
        }
        setLoading(true);
        return subscribeMoments(
            uid,
            (next) => {
                setMoments(next);
                setLoading(false);
            },
            (error) => {
                console.error('Error loading moments:', error);
                setLoading(false);
            }
        );
    }, [uid]);

    return { moments, loading };
};
