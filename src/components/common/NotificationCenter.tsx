import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { CloseIcon, NotificationsIcon } from './icons';

// The header (src/App.tsx) leaves this empty spot next to the account button; the page
// that owns the notifications fills it with the bell.
export const HEADER_NOTIFICATION_SLOT_ID = 'header-notification-slot';

// Notifications already opened on this device, so the badge only counts new ones.
const SEEN_KEY = 'babytracker.notificationsSeen';
const MAX_SEEN = 30;

// `visible`: the item shows in the panel. `key`: what makes it new (changes when the
// content does); null shows it without counting it on the badge, e.g. while loading.
export type NotificationEntry = { visible: boolean; key: string | null };

type NotificationContextValue = {
    report: (slot: string, entry: NotificationEntry | null) => void;
    markSeen: (key: string) => void;
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
};

// Bell in the header with a badge for new notifications; tapping it opens the list.
// The items stay mounted while the list is closed so they keep loading and can pop up.
const NotificationCenter: React.FC<NotificationCenterProps> = ({ children }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [entries, setEntries] = useState<Record<string, NotificationEntry>>({});
    const [seen, setSeen] = useState<string[]>(readSeen);
    const [slot, setSlot] = useState<HTMLElement | null>(null);

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
            return next;
        });
    }, []);

    const context = useMemo(() => ({ report, markSeen }), [report, markSeen]);

    const visible = Object.values(entries).filter((entry) => entry.visible);
    const unread = visible.filter((entry) => entry.key && !seen.includes(entry.key)).length;

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
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                color: unread > 0 ? '#13a4ec' : '#6b7f8a',
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
                        <Typography sx={{ fontSize: 14, color: '#6b7f8a', textAlign: 'center', py: 3 }}>
                            {t('notifications.empty')}
                        </Typography>
                    )}
                </DialogContent>
            </Dialog>
        </NotificationContext.Provider>
    );
};

export default NotificationCenter;
