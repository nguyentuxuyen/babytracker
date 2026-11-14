// Kept apart from the journey player so that screens using the icons do not load the map.
import type { TravelMode } from '../../firebase/moments';

export const MODE_EMOJI: Record<TravelMode, string> = { car: '🚗', train: '🚆', plane: '✈️', ship: '⛴️', walk: '🚶' };
export const STOP_EMOJI = { start: '🏠', end: '🏁' } as const;
