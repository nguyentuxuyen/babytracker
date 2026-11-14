import { useEffect, useState } from 'react';
import { Journey, subscribeJourneys } from '../firebase/journeys';

// Live list of the user's trips ("hành trình"), newest first.
export const useJourneys = (uid?: string | null) => {
    const [journeys, setJourneys] = useState<Journey[]>([]);

    useEffect(() => {
        if (!uid) {
            setJourneys([]);
            return undefined;
        }
        return subscribeJourneys(uid, setJourneys, (error) => console.error('Error loading journeys:', error));
    }, [uid]);

    return journeys;
};
