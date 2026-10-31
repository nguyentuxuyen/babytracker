import { useEffect, useState } from 'react';
import { firestore } from '../firebase/firestore';

type OngoingSleep = { startTime: Date };

export const useSleepTimer = (userId?: string, babyId?: string) => {
	const [ongoingSleep, setOngoingSleep] = useState<OngoingSleep | null>(null);
	const [elapsedSeconds, setElapsedSeconds] = useState(0);

	// Follow the session live: when it is stopped or started on another device,
	// this device updates at once instead of showing a stale timer.
	useEffect(() => {
		if (!userId || !babyId) {
			setOngoingSleep(null);
			return;
		}
		return firestore.subscribeOngoingSleep(userId, babyId, setOngoingSleep);
	}, [userId, babyId]);

	useEffect(() => {
		if (!ongoingSleep) {
			setElapsedSeconds(0);
			return;
		}

		const updateElapsed = () => {
			setElapsedSeconds(Math.max(0, Math.floor((Date.now() - ongoingSleep.startTime.getTime()) / 1000)));
		};
		updateElapsed();
		const interval = window.setInterval(updateElapsed, 1000);
		return () => window.clearInterval(interval);
	}, [ongoingSleep]);

	return { ongoingSleep, elapsedSeconds, setOngoingSleep };
};
