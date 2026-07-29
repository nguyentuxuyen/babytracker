import React, { useState, useEffect, useCallback } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme/theme';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BabyProvider, useBaby } from './contexts/BabyContext';
import { DateProvider } from './contexts/DateContext';
import AppRouter from './routes/AppRouter';
import BabyInfoPage from './pages/BabyInfoPageNew';
import { firestore } from './firebase/firestore';
import { loadReminderSettings, saveReminderSettings } from './utils/reminderSettings';
import { isPushSupported, subscribeUserToPush, unsubscribeUserFromPush, sendTestPushNotification } from './utils/pushNotifications';

import {
    AccountCircle as AccountCircleIcon,
    ChildCare as ChildCareIcon,
    Logout as LogoutIcon,
    Notifications as NotificationsIcon,
    NotificationsOff as NotificationsOffIcon,
    Send as SendIcon
} from '@mui/icons-material';
import { Box, Dialog, DialogTitle, DialogContent, DialogActions, Button as MuiButton, Typography, Chip } from '@mui/material';
import packageJson from '../package.json';
import { changelogEntries } from './utils/changelog';

// Header Component - New Design
const HeaderComponent: React.FC<{
    currentUser: any;
    logout: () => Promise<void>;
    onShowBabyInfo: () => void;
    isOnline: boolean;
    pendingSyncCount: number;
    isSyncing: boolean;
    reminderEnabled: boolean;
    reminderIntervalMinutes: number;
    notificationPermission: NotificationPermission | 'unsupported';
    pushSupported: boolean;
    pushEnabled: boolean;
    onToggleReminder: () => void;
    onChangeReminderInterval: (minutes: number) => void;
    onSendTestPush: () => void;
}> = ({
    currentUser,
    logout,
    onShowBabyInfo,
    isOnline,
    pendingSyncCount,
    isSyncing,
    reminderEnabled,
    reminderIntervalMinutes,
    notificationPermission,
    pushSupported,
    pushEnabled,
    onToggleReminder,
    onChangeReminderInterval,
    onSendTestPush
}) => {
    const { baby } = useBaby();
    const [showMenu, setShowMenu] = useState(false);
    const [showChangelog, setShowChangelog] = useState(false);

    useEffect(() => {
        const seenVersions = localStorage.getItem('babytracker.seenChangelogVersions') || '';
        const currentVersion = process.env.REACT_APP_VERSION || packageJson.version;
        const shouldShow = !seenVersions.split(',').includes(currentVersion);

        if (shouldShow) {
            const timer = window.setTimeout(() => setShowChangelog(true), 400);
            return () => window.clearTimeout(timer);
        }
    }, []);

    const handleCloseChangelog = () => {
        const currentVersion = process.env.REACT_APP_VERSION || packageJson.version;
        const seenVersions = (localStorage.getItem('babytracker.seenChangelogVersions') || '').split(',').filter(Boolean);
        if (!seenVersions.includes(currentVersion)) {
            seenVersions.push(currentVersion);
            localStorage.setItem('babytracker.seenChangelogVersions', seenVersions.join(','));
        }
        setShowChangelog(false);
    };

    const versionLabel = process.env.REACT_APP_VERSION || packageJson.version;

    return (
        <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            backgroundColor: 'rgba(246, 247, 248, 0.8)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
        }}>
            <div style={{
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                maxWidth: '1200px',
                margin: '0 auto'
            }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                }}>
                    <div style={{
                        fontSize: '20px',
                        fontWeight: '700',
                        color: '#101c22',
                        fontFamily: 'Manrope, sans-serif'
                    }}>
                        {(() => {
                            const namePart = baby?.name ? `Welcome, ${baby.name}くん` : 'Welcome';
                            return namePart;
                        })()}
                    </div>
                    <div style={{
                        fontSize: '12px',
                        fontWeight: '400',
                        color: '#6b7f8a'
                    }}>
                        {(() => {
                            try {
                                if (baby?.birthDate) {
                                    const birth = new Date(baby.birthDate);
                                    if (!isNaN(birth.getTime())) {
                                        const now = new Date();
                                        const birthNorm = new Date(birth);
                                        birthNorm.setHours(0,0,0,0);
                                        const nowNorm = new Date(now);
                                        nowNorm.setHours(0,0,0,0);
                                        let months = (nowNorm.getFullYear() - birthNorm.getFullYear()) * 12 + (nowNorm.getMonth() - birthNorm.getMonth());
                                        if (nowNorm.getDate() < birthNorm.getDate()) {
                                            months--;
                                        }

                                        const tempDate = new Date(birthNorm);
                                        tempDate.setMonth(tempDate.getMonth() + months);
                                        const days = Math.floor((nowNorm.getTime() - tempDate.getTime()) / (1000 * 60 * 60 * 24));

                                        if (months > 0) {
                                            if (days === 0) {
                                                return `${months} tháng tuổi`;
                                            }
                                            return `${months} tháng ${days} ngày tuổi`;
                                        }
                                        return `${days} ngày tuổi`;
                                    }
                                }
                            } catch (err) {
                                // ignore
                            }
                            return '';
                        })()}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                        {!isOnline && (
                            <div style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#ffffff',
                                backgroundColor: '#ef4444',
                                borderRadius: '999px',
                                padding: '2px 8px'
                            }}>
                                Offline mode
                            </div>
                        )}
                        {isOnline && pendingSyncCount > 0 && (
                            <div style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#ffffff',
                                backgroundColor: '#f59e0b',
                                borderRadius: '999px',
                                padding: '2px 8px'
                            }}>
                                {pendingSyncCount} đang chờ đồng bộ
                            </div>
                        )}
                        {isSyncing && (
                            <div style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#ffffff',
                                backgroundColor: '#13a4ec',
                                borderRadius: '999px',
                                padding: '2px 8px'
                            }}>
                                Đang đồng bộ...
                            </div>
                        )}
                        {reminderEnabled && (
                            <div style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#ffffff',
                                backgroundColor: '#10b981',
                                borderRadius: '999px',
                                padding: '2px 8px'
                            }}>
                                Nhắc nhở mỗi {Math.round(reminderIntervalMinutes / 60)}h
                            </div>
                        )}
                        {pushEnabled && (
                            <div style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#ffffff',
                                backgroundColor: '#0f766e',
                                borderRadius: '999px',
                                padding: '2px 8px'
                            }}>
                                Push server: bật
                            </div>
                        )}
                    </div>
                </div>

                {currentUser && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <Chip
                                label={`v${versionLabel}`}
                                size="small"
                                sx={{
                                    bgcolor: '#e0f2fe',
                                    color: '#0f766e',
                                    fontWeight: 700,
                                    borderRadius: '999px'
                                }}
                            />
                            <MuiButton
                                variant="text"
                                size="small"
                                onClick={() => setShowChangelog(true)}
                                sx={{
                                    minWidth: 'auto',
                                    color: '#13a4ec',
                                    textTransform: 'none',
                                    fontSize: '12px',
                                    p: 0,
                                    fontWeight: 600
                                }}
                            >
                                Changelog
                            </MuiButton>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowMenu(!showMenu)}
                                style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '24px',
                                    background: '#13a4ec',
                                    border: 'none',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                    boxShadow: '0 2px 8px rgba(19, 164, 236, 0.3)'
                                }}
                            >
                                <AccountCircleIcon sx={{ fontSize: '28px' }} />
                            </button>

                            {showMenu && (
                                <div style={{
                                    position: 'absolute',
                                    top: '56px',
                                    right: '0',
                                    background: '#ffffff',
                                    borderRadius: '12px',
                                    border: '1px solid #e5e7eb',
                                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                                    minWidth: '220px',
                                    zIndex: 1000,
                                    overflow: 'hidden'
                                }}>
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
                                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#101c22' }}>
                                            {currentUser.email}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            onShowBabyInfo();
                                            setShowMenu(false);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '12px 16px',
                                            background: 'none',
                                            border: 'none',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            color: '#101c22',
                                            fontWeight: '500',
                                            transition: 'background-color 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                        onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#f6f7f8'}
                                        onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                                    >
                                        <ChildCareIcon sx={{ fontSize: '20px', color: '#13a4ec' }} />
                                        Thông tin bé
                                    </button>
                                    <button
                                        onClick={onToggleReminder}
                                        style={{
                                            width: '100%',
                                            padding: '12px 16px',
                                            background: 'none',
                                            border: 'none',
                                            borderTop: '1px solid #e5e7eb',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            color: '#101c22',
                                            fontWeight: '500',
                                            transition: 'background-color 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                        onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#f6f7f8'}
                                        onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                                    >
                                        {reminderEnabled ? (
                                            <NotificationsIcon sx={{ fontSize: '20px', color: '#10b981' }} />
                                        ) : (
                                            <NotificationsOffIcon sx={{ fontSize: '20px', color: '#6b7f8a' }} />
                                        )}
                                        {reminderEnabled ? 'Tắt nhắc nhở' : 'Bật nhắc nhở'}
                                    </button>
                                    <div style={{
                                        borderTop: '1px solid #e5e7eb',
                                        padding: '10px 16px',
                                        fontSize: '12px',
                                        color: '#6b7f8a'
                                    }}>
                                        Trạng thái thông báo: {notificationPermission}
                                        <div style={{ marginTop: '6px' }}>
                                            Push server: {pushSupported ? (pushEnabled ? 'enabled' : 'disabled') : 'unsupported'}
                                        </div>
                                        <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {[60, 120, 180, 240].map((minutes) => (
                                                <button
                                                    key={minutes}
                                                    onClick={() => onChangeReminderInterval(minutes)}
                                                    style={{
                                                        border: 'none',
                                                        borderRadius: '999px',
                                                        padding: '4px 8px',
                                                        fontSize: '11px',
                                                        cursor: 'pointer',
                                                        color: reminderIntervalMinutes === minutes ? '#ffffff' : '#334155',
                                                        backgroundColor: reminderIntervalMinutes === minutes ? '#13a4ec' : '#e5e7eb'
                                                    }}
                                                >
                                                    {minutes / 60}h
                                                </button>
                                            ))}
                                        </div>
                                        {pushSupported && (
                                            <button
                                                onClick={onSendTestPush}
                                                style={{
                                                    marginTop: '8px',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    padding: '6px 10px',
                                                    fontSize: '12px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    color: '#ffffff',
                                                    backgroundColor: '#0f766e'
                                                }}
                                            >
                                                <SendIcon sx={{ fontSize: '16px' }} />
                                                Gửi test push
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await logout();
                                                setShowMenu(false);
                                            } catch (error) {
                                                console.error('Logout error:', error);
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '12px 16px',
                                            background: 'none',
                                            border: 'none',
                                            borderTop: '1px solid #e5e7eb',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            color: '#ef4444',
                                            fontWeight: '500',
                                            transition: 'background-color 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                        onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#fef2f2'}
                                        onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                                    >
                                        <LogoutIcon sx={{ fontSize: '20px' }} />
                                        Đăng xuất
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <Dialog open={showChangelog} onClose={handleCloseChangelog} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ pb: 1 }}>What’s new</DialogTitle>
                <DialogContent dividers>
                    {changelogEntries.map((entry) => (
                        <Box key={entry.version} sx={{ mb: 2.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#101c22' }}>
                                    {entry.title}
                                </Typography>
                                <Chip label={`v${entry.version}`} size="small" sx={{ bgcolor: '#f0fdf4', color: '#166534' }} />
                            </Box>
                            <Typography variant="body2" sx={{ color: '#6b7f8a', mb: 1 }}>
                                {entry.date}
                            </Typography>
                            <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
                                {entry.changes.map((change) => (
                                    <Typography key={change} component="li" variant="body2" sx={{ color: '#334155', mb: 0.5 }}>
                                        {change}
                                    </Typography>
                                ))}
                            </Box>
                        </Box>
                    ))}
                </DialogContent>
                <DialogActions>
                    <MuiButton onClick={handleCloseChangelog} variant="contained" sx={{ bgcolor: '#13a4ec' }}>
                        Đóng
                    </MuiButton>
                </DialogActions>
            </Dialog>
        </div>
    );
};

// Main App Component
const MainApp: React.FC = () => {
    const { currentUser, logout, loading } = useAuth();
    const { baby } = useBaby();
    const [showBabyInfo, setShowBabyInfo] = useState(false);
    const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [reminderEnabled, setReminderEnabled] = useState(false);
    const [reminderIntervalMinutes, setReminderIntervalMinutes] = useState(180);
    const [lastReminderAt, setLastReminderAt] = useState<string | null>(null);
    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
        typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
    );
    const [pushEnabled, setPushEnabled] = useState(false);
    const [pushSupported, setPushSupported] = useState(false);

    const refreshPendingSyncCount = useCallback(async () => {
        if (!currentUser?.uid) {
            setPendingSyncCount(0);
            return;
        }
        const count = await firestore.getPendingActivitiesCount(currentUser.uid);
        setPendingSyncCount(count);
    }, [currentUser?.uid]);

    const syncPendingActivities = useCallback(async () => {
        if (!currentUser?.uid) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
        setIsSyncing(true);
        try {
            await firestore.syncPendingActivities(currentUser.uid);
        } finally {
            setIsSyncing(false);
            await refreshPendingSyncCount();
        }
    }, [currentUser?.uid, refreshPendingSyncCount]);

    useEffect(() => {
        if (!currentUser?.uid) {
            setPendingSyncCount(0);
            return;
        }

        const handleOnline = () => {
            setIsOnline(true);
            void syncPendingActivities();
        };

        const handleOffline = () => {
            setIsOnline(false);
        };

        const handleQueueUpdated = () => {
            void refreshPendingSyncCount();
        };

        void refreshPendingSyncCount();
        if (typeof navigator === 'undefined' || navigator.onLine) {
            void syncPendingActivities();
        }

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('offline-queue-updated', handleQueueUpdated as EventListener);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('offline-queue-updated', handleQueueUpdated as EventListener);
        };
    }, [currentUser?.uid, refreshPendingSyncCount, syncPendingActivities]);

    useEffect(() => {
        const settings = loadReminderSettings();
        setReminderEnabled(settings.enabled);
        setReminderIntervalMinutes(settings.intervalMinutes);
        setLastReminderAt(settings.lastReminderAt);
        setPushSupported(isPushSupported());
        if (typeof Notification !== 'undefined') {
            setNotificationPermission(Notification.permission);
        }
    }, []);

    useEffect(() => {
        saveReminderSettings({
            enabled: reminderEnabled,
            intervalMinutes: reminderIntervalMinutes,
            lastReminderAt
        });
    }, [reminderEnabled, reminderIntervalMinutes, lastReminderAt]);

    const onToggleReminder = useCallback(async () => {
        if (typeof Notification === 'undefined') {
            setNotificationPermission('unsupported');
            return;
        }

        if (reminderEnabled) {
            setReminderEnabled(false);
            if (pushSupported && currentUser) {
                try {
                    await unsubscribeUserFromPush(currentUser);
                } catch (error) {
                    console.error('Failed to unsubscribe push:', error);
                }
            }
            setPushEnabled(false);
            return;
        }

        if (Notification.permission !== 'granted') {
            const permission = await Notification.requestPermission();
            setNotificationPermission(permission);
            if (permission !== 'granted') {
                setReminderEnabled(false);
                return;
            }
        } else {
            setNotificationPermission('granted');
        }

        setReminderEnabled(true);
        if (pushSupported && currentUser) {
            try {
                await subscribeUserToPush(currentUser, reminderIntervalMinutes);
                setPushEnabled(true);
            } catch (error) {
                console.error('Failed to subscribe push (fallback to local notifications):', error);
                setPushEnabled(false);
            }
        }
    }, [reminderEnabled, pushSupported, currentUser, reminderIntervalMinutes]);

    const onChangeReminderInterval = useCallback(async (minutes: number) => {
        setReminderIntervalMinutes(minutes);
        if (reminderEnabled && pushSupported && currentUser) {
            try {
                await subscribeUserToPush(currentUser, minutes);
                setPushEnabled(true);
            } catch (error) {
                console.error('Failed to update push interval:', error);
            }
        }
    }, [reminderEnabled, pushSupported, currentUser]);

    const onSendTestPush = useCallback(async () => {
        if (!currentUser || !pushSupported) return;
        try {
            await sendTestPushNotification(currentUser);
        } catch (error) {
            console.error('Failed to send test push:', error);
        }
    }, [currentUser, pushSupported]);

    useEffect(() => {
        if (!reminderEnabled) return;
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

        const timer = window.setInterval(() => {
            const now = new Date();
            const last = lastReminderAt ? new Date(lastReminderAt) : null;
            const elapsedMinutes = last ? (now.getTime() - last.getTime()) / (1000 * 60) : Infinity;

            if (elapsedMinutes < reminderIntervalMinutes) {
                return;
            }

            const babyName = baby?.name ? ` cho ${baby.name}` : '';
            new Notification('Baby Tracker Reminder', {
                body: `Đã đến lúc cập nhật hoạt động${babyName} 👶`,
                icon: `${process.env.PUBLIC_URL}/icon-192.svg`,
                badge: `${process.env.PUBLIC_URL}/icon-192.svg`
            });
            setLastReminderAt(now.toISOString());
        }, 60 * 1000);

        return () => {
            window.clearInterval(timer);
        };
    }, [reminderEnabled, reminderIntervalMinutes, lastReminderAt, baby?.name]);

    useEffect(() => {
        if (!pushSupported || !currentUser) {
            setPushEnabled(false);
            return;
        }

        let cancelled = false;
        navigator.serviceWorker.ready
            .then((registration) => registration.pushManager.getSubscription())
            .then((subscription) => {
                if (!cancelled) {
                    setPushEnabled(Boolean(subscription));
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setPushEnabled(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [pushSupported, currentUser]);

    // Show loading spinner while checking auth
    if (loading) {
        console.log('[App] Loading auth state...');
        return (
            <Box sx={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100vh',
                bgcolor: '#f6f7f8'
            }}>
                <Box sx={{ color: '#101c22', fontSize: '18px' }}>Đang tải...</Box>
            </Box>
        );
    }

    // Redirect to login if not authenticated - let AppRouter handle this
    if (!currentUser) {
        console.log('[App] No user, showing AppRouter (will redirect to /login)');
        return <AppRouter />;
    }

    // Show baby info modal if requested
    if (showBabyInfo) {
        return <BabyInfoPage onBack={() => setShowBabyInfo(false)} />;
    }

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            bgcolor: '#f6f7f8'
        }}>
            {/* Sticky Header */}
            <HeaderComponent
                currentUser={currentUser}
                logout={logout}
                onShowBabyInfo={() => setShowBabyInfo(true)}
                isOnline={isOnline}
                pendingSyncCount={pendingSyncCount}
                isSyncing={isSyncing}
                reminderEnabled={reminderEnabled}
                reminderIntervalMinutes={reminderIntervalMinutes}
                notificationPermission={notificationPermission}
                pushSupported={pushSupported}
                pushEnabled={pushEnabled}
                onToggleReminder={onToggleReminder}
                onChangeReminderInterval={onChangeReminderInterval}
                onSendTestPush={onSendTestPush}
            />

            {/* Main content with router and bottom nav */}
            <Box sx={{ flex: 1 }}>
                <AppRouter />
            </Box>
        </Box>
    );
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <BabyProvider>
                <DateProvider>
                    <ThemeProvider theme={theme}>
                        <CssBaseline />
                        <MainApp />
                    </ThemeProvider>
                </DateProvider>
            </BabyProvider>
        </AuthProvider>
    );
};

export default App;
