import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { CloseIcon, NotificationsIcon } from './icons';
import {
    MAX_SEEN,
    laterDay,
    mergeSeen,
    saveNotificationDay,
    saveSeenNotifications,
    subscribeNotificationState
} from '../../firebase/notificationState';

// The header (src/App.tsx) leaves this empty spot next to the account button; the page
// that owns the notifications fills it with the bell.
export const HEADER_NOTIFICATION_SLOT_ID = 'header-notification-slot';

// Notifications already opened, so the badge only counts new ones. Kept on the account
// (src/firebase/notificationState.ts) so every device agrees; this copy is for offline starts.
const SEEN_KEY = 'babytracker.notificationsSeen';
// "Done for this day" flags (popup seen, card dismissed) are cached under babytracker.<name>.
const dayStorageKey = (name: string) => `babytracker.${name}`;
// How long to wait for the account copy before falling back to this device's copy.
const REMOTE_WAIT_MS = 4000;

// `visible`: the item shows in the panel. `key`: what makes it new (changes when the
// content does); null shows it without counting it on the badge, e.g. while loading.
export type NotificationEntry = { visible: boolean; key: string | null };

type NotificationContextValue = {
    report: (slot: string, entry: NotificationEntry | null) => void;
    markSeen: (key: string) => void;
    getDay: (name: string) => string | null;
    setDay: (name: string, day: string) => void;
    // The account copy has loaded (or could not be reached), so flags are final.
    ready: boolean;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

const readSeen = (): string[] => {
    try {
        const saved = JSON.parse(window.localStorage.getItem(SEEN_KEY) || '[]');
        return Array.isArray(saved) ? saved.filter((key) => typeof key === 'string') : [];
    } catch {
        return [];
    }
};

const writeSeen = (keys: string[]) => {
    try {
        window.localStorage.setItem(SEEN_KEY, JSON.stringify(keys));
    } catch {
        // Storage unavailable: the badge resets on the next visit.
    }
};

const readDay = (name: string) => {
    try {
        return window.localStorage.getItem(dayStorageKey(name));
    } catch {
        return null;
    }
};

const writeDay = (name: string, day: string) => {
    try {
        window.localStorage.setItem(dayStorageKey(name), day);
    } catch {
        // Storage unavailable: the account copy still has it.
    }
};

// A "done for this day" flag shared by all devices, e.g. the day whose review already popped
// up. Returns [day, setDay, ready]; outside a NotificationCenter it only uses this device.
export const useNotificationDay = (name: string): [string | null, (day: string) => void, boolean] => {
    const context = useContext(NotificationContext);
    const [localDay, setLocalDay] = useState(() => readDay(name));
    const setLocal = useCallback((day: string) => {
        writeDay(name, day);
        setLocalDay(day);
    }, [name]);
    if (context) {
        return [context.getDay(name), (day: string) => context.setDay(name, day), context.ready];
    }
    return [localDay, setLocal, true];
};

// Lets a notification inside the panel tell the bell whether it is showing. Outside a
// NotificationCenter (tests, other pages) it does nothing.
export const useNotificationEntry = (slot: string, entry: NotificationEntry) => {
    const context = useContext(NotificationContext);
    const { visible, key } = entry;
    useEffect(() => {
        context?.report(slot, { visible, key });
    }, [context, slot, visible, key]);
    useEffect(() => () => context?.report(slot, null), [context, slot]);
    return context?.markSeen;
};

type NotificationCenterProps = {
    children: React.ReactNode;
    // Signed-in account: what was seen is shared with the user's other devices.
    userId?: string | null;
};

// Bell in the header with a badge for new notifications; tapping it opens the list.
// The items stay mounted while the list is closed so they keep loading and can pop up.
const NotificationCenter: React.FC<NotificationCenterProps> = ({ children, userId }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [entries, setEntries] = useState<Record<string, NotificationEntry>>({});
    const [seen, setSeen] = useState<string[]>(readSeen);
    const [days, setDays] = useState<Record<string, string>>({});
    const daysRef = useRef(days);
    const [remoteReady, setRemoteReady] = useState(false);
    const [slot, setSlot] = useState<HTMLElement | null>(null);
    const ready = !userId || remoteReady;

    // Follow the account copy: other devices' "seen" marks arrive here, and anything this
    // device marked while offline is sent up once it is newer than the account copy.
    useEffect(() => {
        setRemoteReady(false);
        if (!userId) return undefined;
        const timer = window.setTimeout(() => setRemoteReady(true), REMOTE_WAIT_MS);
        const unsubscribe = subscribeNotificationState(
            userId,
            (remote) => {
                window.clearTimeout(timer);
                const local = readSeen();
                const mergedSeen = mergeSeen(remote.seen, local);
                writeSeen(mergedSeen);
                setSeen(mergedSeen);
                if (mergedSeen.length !== remote.seen.length || mergedSeen.some((key, index) => key !== remote.seen[index])) {
                    saveSeenNotifications(userId, mergedSeen).catch(() => undefined);
                }
                const current = daysRef.current;
                const next: Record<string, string> = { ...current };
                new Set([...Object.keys(current), ...Object.keys(remote.days)]).forEach((name) => {
                    const day = laterDay(laterDay(remote.days[name], current[name]), readDay(name));
                    if (!day) return;
                    next[name] = day;
                    writeDay(name, day);
                    if (day !== remote.days[name]) saveNotificationDay(userId, name, day).catch(() => undefined);
                });
                daysRef.current = next;
                setDays(next);
                setRemoteReady(true);
            },
            () => {
                // Offline or not allowed: keep going with this device's copy.
                window.clearTimeout(timer);
                setRemoteReady(true);
            }
        );
        return () => {
            window.clearTimeout(timer);
            unsubscribe();
        };
    }, [userId]);

    useEffect(() => {
        setSlot(document.getElementById(HEADER_NOTIFICATION_SLOT_ID));
    }, []);

    const report = useCallback((name: string, entry: NotificationEntry | null) => {
        setEntries((current) => {
            const previous = current[name];
            if (!entry) {
                if (!previous) return current;
                const { [name]: _removed, ...rest } = current;
                return rest;
            }
            if (previous && previous.visible === entry.visible && previous.key === entry.key) return current;
            return { ...current, [name]: entry };
        });
    }, []);

    const markSeen = useCallback((key: string) => {
        setSeen((current) => {
            if (current.includes(key)) return current;
            const next = [...current, key].slice(-MAX_SEEN);
            writeSeen(next);
            if (userId) saveSeenNotifications(userId, next).catch(() => undefined);
            return next;
        });
    }, [userId]);

    const setDay = useCallback((name: string, day: string) => {
        writeDay(name, day);
        daysRef.current = { ...daysRef.current, [name]: day };
        setDays(daysRef.current);
        if (userId) saveNotificationDay(userId, name, day).catch(() => undefined);
    }, [userId]);

    // Flags this device already knows, before (or without) the account copy.
    const getDay = useCallback((name: string) => days[name] ?? readDay(name), [days]);

    const context = useMemo(
        () => ({ report, markSeen, getDay, setDay, ready }),
        [report, markSeen, getDay, setDay, ready]
    );

    const visible = Object.values(entries).filter((entry) => entry.visible);
    // Until the account copy arrives, do not count what another device may have opened.
    const unread = ready ? visible.filter((entry) => entry.key && !seen.includes(entry.key)).length : 0;

    // Everything in the list counts as read once it is open.
    useEffect(() => {
        if (!open) return;
        visible.forEach((entry) => {
            if (entry.key) markSeen(entry.key);
        });
    }, [open, visible.map((entry) => entry.key).join('|'), markSeen]); // eslint-disable-line react-hooks/exhaustive-deps

    const bell = (
        <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={unread > 0 ? t('notifications.openWithCount', { count: unread }) : t('notifications.open')}
            style={{
                position: 'relative',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                color: unread > 0 ? '#13a4ec' : '#5b6b75',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0
            }}
        >
            <NotificationsIcon sx={{ fontSize: '22px' }} />
            {unread > 0 && (
                <span
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        top: '-2px',
                        right: '-2px',
                        minWidth: '18px',
                        height: '18px',
                        padding: '0 5px',
                        borderRadius: '999px',
                        background: '#ef4444',
                        border: '2px solid #ffffff',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 700,
                        lineHeight: '14px',
                        textAlign: 'center',
                        boxSizing: 'border-box'
                    }}
                >
                    {unread > 9 ? '9+' : unread}
                </span>
            )}
        </button>
    );

    return (
        <NotificationContext.Provider value={context}>
            {slot && ReactDOM.createPortal(bell, slot)}
            <Dialog
                open={open}
                onClose={() => setOpen(false)}
                keepMounted
                fullWidth
                maxWidth="sm"
                PaperProps={{ sx: { borderRadius: '24px', m: 2, width: 'calc(100% - 32px)', bgcolor: '#f6f7f8' } }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, fontWeight: 700, fontSize: 20, pb: 0.5 }}>
                    {t('notifications.title')}
                    <IconButton size="small" onClick={() => setOpen(false)} aria-label={t('common.close')} sx={{ mr: -1 }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ pt: '8px !important', pb: 1 }}>
                    {children}
                    {visible.length === 0 && (
                        <Typography sx={{ fontSize: 14, color: '#5b6b75', textAlign: 'center', py: 3 }}>
                            {t('notifications.empty')}
                        </Typography>
                    )}
                </DialogContent>
            </Dialog>
        </NotificationContext.Provider>
    );
};

export default NotificationCenter;
