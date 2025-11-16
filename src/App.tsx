import React, { useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme/theme';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BabyProvider, useBaby } from './contexts/BabyContext';
import { DateProvider } from './contexts/DateContext';
import AppRouter from './routes/AppRouter';
import BabyInfoPage from './pages/BabyInfoPageNew';

import {
    AccountCircle as AccountCircleIcon,
    ChildCare as ChildCareIcon,
    Logout as LogoutIcon,
} from '@mui/icons-material';
import { Box } from '@mui/material';

// Header Component - New Design
const HeaderComponent: React.FC<{
    currentUser: any;
    logout: () => Promise<void>;
    onShowBabyInfo: () => void;
}> = ({ currentUser, logout, onShowBabyInfo }) => {
    const { baby } = useBaby();
    const [showMenu, setShowMenu] = useState(false);

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
                {/* Left side - Name and age */}
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
                                        const diffMs = nowNorm.getTime() - birthNorm.getTime();
                                        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                        if (days >= 0) return `${days} days old`;
                                    }
                                }
                            } catch (err) {
                                // ignore
                            }
                            return '';
                        })()}
                    </div>
                </div>

                {/* Right side - Avatar */}
                {currentUser && (
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
            )}
        </div>
        </div>
    );
};

// Main App Component
const MainApp: React.FC = () => {
    const { currentUser, logout, loading } = useAuth();
    const [showBabyInfo, setShowBabyInfo] = useState(false);

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
