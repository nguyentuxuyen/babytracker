import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BabyProvider, useBaby } from './contexts/BabyContext';
import ActivitiesPageNew from './pages/ActivitiesPageNew';
import BabyInfoPageNew from './pages/BabyInfoPageNew';
import StatsPageNewGlass from './pages/StatsPageNewGlass';

import {
    Favorite as FavoriteIcon,
    CalendarToday as CalendarTodayIcon,
    AccountCircle as AccountCircleIcon,
    ChildCare as ChildCareIcon,
    Logout as LogoutIcon,
    PersonOff as PersonOffIcon,
    Edit as EditIcon,
    BarChart as BarChartIcon,
    ArrowBack as ArrowBackIcon
} from '@mui/icons-material';

// Header Component
const HeaderComponent: React.FC<{
    currentUser: any;
    logout: () => Promise<void>;
    onShowBabyInfo: () => void;
}> = ({ currentUser, logout, onShowBabyInfo }) => {
    const { baby } = useBaby();
    const [showMenu, setShowMenu] = useState(false);
    const today = new Date().toLocaleDateString('vi-VN', { 
        year: 'numeric', 
        month: 'numeric', 
        day: 'numeric' 
    });

    return (
        <div style={{
            position: 'sticky',
            top: 0,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderTop: 'none',
            padding: '12px 16px',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
        }}>
            {/* Left side - Greeting and date */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                flex: 1
            }}>
                <div style={{
                    fontSize: '20px',
                    fontWeight: '600',
                    color: '#333333',
                    fontFamily: '"Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    Hello {baby?.name + 'くん' || 'bé yêu'}!
                    <span style={{ fontSize: '24px', color: 'rgba(0, 0, 0, 0.6)', fontWeight: '400' }}>
                        {today}
                    </span>
                </div>
            </div>

            {/* Right side - User menu */}
            {currentUser && (
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '20px',
                            background: 'rgba(0, 0, 0, 0.05)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(0, 0, 0, 0.1)',
                            color: '#333333',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        <AccountCircleIcon sx={{ fontSize: '20px' }} />
                    </button>

                    {showMenu && (
                        <div style={{
                            position: 'absolute',
                            top: '48px',
                            right: '0',
                            background: 'rgba(255, 255, 255, 0.95)',
                            backdropFilter: 'blur(20px)',
                            borderRadius: '12px',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                            minWidth: '200px',
                            zIndex: 1000
                        }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0, 0, 0, 0.1)' }}>
                                <div style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>
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
                                    color: '#333',
                                    fontWeight: '500',
                                    transition: 'background-color 0.2s',
                                    borderBottom: '1px solid rgba(0, 0, 0, 0.1)'
                                }}
                                onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
                                onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                            >
                                <ChildCareIcon sx={{ mr: 1, color: '#6750A4' }} />
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
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    color: '#d32f2f',
                                    fontWeight: '500',
                                    borderRadius: '0 0 12px 12px',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = 'rgba(211, 47, 47, 0.1)'}
                                onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                            >
                                <LogoutIcon sx={{ mr: 1 }} />
                                Đăng xuất
                            </button>
                        </div>
                    )}
                </div>
            )}

            {!currentUser && (
                <div style={{
                    fontSize: '12px',
                    color: 'rgba(0, 0, 0, 0.6)',
                    background: 'rgba(0, 0, 0, 0.05)',
                    padding: '6px 12px',
                    borderRadius: '12px',
                    border: '1px solid rgba(0, 0, 0, 0.1)'
                }}>
                    <PersonOffIcon sx={{ mr: 0.5, fontSize: '16px' }} />
                    Chưa đăng nhập
                </div>
            )}
        </div>
    );
};

// Main App Component with 3 Tabs
const MainApp: React.FC = () => {
    const { currentUser, loading, logout } = useAuth();
    const [activeTab, setActiveTab] = useState<'activities' | 'stats'>('activities');

    // Material Design 3 colors
    const colors = {
        primary: '#6750A4',
        primaryContainer: '#EADDFF',
        secondary: '#625B71',
        secondaryContainer: '#E8DEF8',
        surface: '#FFFBFE',
        surfaceVariant: '#E7E0EC',
        outline: '#79747E',
        outlineVariant: '#CAC4D0',
        onSurface: '#1C1B1F',
        onSurfaceVariant: '#49454F'
    };

    // Set default tab based on login status
    useEffect(() => {
        if (!loading) {
            if (!currentUser) {
                // Automatically show login screen for unauthenticated users
                setShowBabyInfo(true);
            } else {
                // Reset to activities tab when user logs in
                setActiveTab('activities');
                setShowBabyInfo(false);
            }
        }
    }, [currentUser, loading]);

    const tabs = [
        {
            id: 'activities' as const,
            label: 'Ghi chép hoạt động',
            icon: '📝',
            component: <ActivitiesPageNew />
        },
        {
            id: 'stats' as const,
            label: 'Thống kê',
            icon: '�',
            component: <StatsPageNewGlass />
        }
    ];

    // Separate baby info page state
    const [showBabyInfo, setShowBabyInfo] = useState(false);

    const renderTabBar = () => (
        <div style={{
            position: 'fixed',
            bottom: '16px',
            left: '16px',
            right: '16px',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            display: 'flex',
            padding: '8px',
            paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
            zIndex: 1000,
            borderRadius: '20px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}>
            {tabs.map(tab => {
                const isActive = activeTab === tab.id;
                const isDisabled = !currentUser && tab.id === 'activities';
                
                return (
                    <button
                        key={tab.id}
                        onClick={() => {
                            if (!isDisabled) {
                                setActiveTab(tab.id);
                            }
                        }}
                        disabled={isDisabled}
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '12px 8px 16px 8px',
                            background: isActive 
                                ? 'rgba(0, 0, 0, 0.1)' 
                                : 'rgba(0, 0, 0, 0.02)',
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)',
                            borderRadius: '20px',
                            margin: '4px',
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            opacity: isDisabled ? 0.5 : 1,
                            transition: 'all 0.3s ease',
                            fontFamily: '"Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            border: isActive 
                                ? '1px solid rgba(0, 0, 0, 0.15)' 
                                : '1px solid rgba(0, 0, 0, 0.05)',
                            boxShadow: isActive 
                                ? '0 8px 32px rgba(0, 0, 0, 0.1)' 
                                : '0 4px 16px rgba(0, 0, 0, 0.05)'
                        }}
                    >
                        <div style={{
                            fontSize: '18px',
                            marginBottom: '4px',
                            color: isActive ? '#333333' : 'rgba(0, 0, 0, 0.5)'
                        }}>
                            {tab.id === 'activities' && <EditIcon />}
                            {tab.id === 'stats' && <BarChartIcon />}
                        </div>
                        <span style={{
                            fontSize: '11px',
                            fontWeight: isActive ? '600' : '400',
                            color: isActive ? '#333333' : 'rgba(0, 0, 0, 0.5)',
                            textAlign: 'center',
                            lineHeight: '1.2'
                        }}>
                            {tab.label}
                        </span>

                    </button>
                );
            })}
        </div>
    );

    const renderCurrentPage = () => {
        if (showBabyInfo) {
            return <BabyInfoPageNew />;
        }
        const currentTab = tabs.find(tab => tab.id === activeTab);
        return currentTab ? currentTab.component : tabs[0].component;
    };

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                backgroundColor: colors.surface,
                fontFamily: '"Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                        fontSize: '48px', 
                        marginBottom: '16px',
                        animation: 'pulse 1.5s infinite'
                    }}>
                        👶
                    </div>
                    <p style={{ 
                        color: colors.onSurfaceVariant,
                        fontSize: '16px'
                    }}>
                        Đang tải...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ 
            minHeight: '100vh',
            background: '#ffffff',
            paddingBottom: showBabyInfo ? '16px' : '100px' // No tab bar space when showing baby info
        }}>
            {/* Header */}
            <HeaderComponent currentUser={currentUser} logout={logout} onShowBabyInfo={() => setShowBabyInfo(true)} />

            {/* Back button for Baby Info */}
            {showBabyInfo && currentUser && (
                <div style={{ padding: '16px' }}>
                    <button
                        onClick={() => setShowBabyInfo(false)}
                        style={{
                            background: 'rgba(0, 0, 0, 0.05)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(0, 0, 0, 0.1)',
                            borderRadius: '12px',
                            padding: '8px 16px',
                            color: '#333333',
                            fontSize: '14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <ArrowBackIcon sx={{ mr: 1 }} />
                        Quay lại
                    </button>
                </div>
            )}

            {/* Page Content */}
            {renderCurrentPage()}

            {/* Bottom Navigation - only show when authenticated and not in baby info */}
            {!showBabyInfo && currentUser && renderTabBar()}

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                
                button:hover {
                    opacity: 0.8 !important;
                }
                
                button:active {
                    transform: scale(0.98);
                }
            `}</style>
        </div>
    );
};

// Root App Component
const App: React.FC = () => {
    return (
        <AuthProvider>
            <BabyProvider>
                <MainApp />
            </BabyProvider>
        </AuthProvider>
    );
};

export default App;