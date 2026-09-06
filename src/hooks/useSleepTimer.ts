import { useEffect, useState } from 'react';
import { firestore } from '../firebase/firestore';

type OngoingSleep = { startTime: Date };

export const useSleepTimer = (userId?: string, babyId?: string) => {
	const [ongoingSleep, setOngoingSleep] = useState<OngoingSleep | null>(null);
	const [elapsedSeconds, setElapsedSeconds] = useState(0);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			if (!userId || !babyId) {
				setOngoingSleep(null);
				return;
			}
			const sleep = await firestore.getOngoingSleep(userId, babyId);
			if (!cancelled) setOngoingSleep(sleep);
		};

		void load();
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') void load();
		};
		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => {
			cancelled = true;
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
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
