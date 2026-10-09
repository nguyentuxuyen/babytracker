import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import { HomeIcon, ChartIcon as ShowChartIcon, FoodIcon as RestaurantIcon, HistoryIcon, AddIcon } from '../common/icons';

const ROUTES = ['/', '/timeline', '/?add=1', '/statistics', '/food-history'];

const labelSx = {
    '& .MuiBottomNavigationAction-label': {
        fontSize: '11px',
        fontWeight: 600,
        marginTop: '2px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
        '&.Mui-selected': { fontSize: '11px' }
    }
};

const BottomNav: React.FC = () => {
    const history = useHistory();
    const location = useLocation();
    const { t } = useTranslation();

    const getNavValue = () => {
        const path = location.pathname;
        if (path === '/' || path === '/activities') return 0;
        if (path === '/timeline') return 1;
        if (path === '/statistics') return 3;
        if (path === '/food-history') return 4;
        return -1;
    };

    return (
        <Paper
            elevation={0}
            sx={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 1000,
                bgcolor: 'rgba(255, 255, 255, 0.92)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderTop: '1px solid #e5e7eb',
                // Keep the bar clear of the iPhone home indicator in the installed PWA
                paddingBottom: 'env(safe-area-inset-bottom)'
            }}
        >
            <BottomNavigation
                value={getNavValue()}
                onChange={(event, newValue: number) => {
                    if (ROUTES[newValue]) history.push(ROUTES[newValue]);
                }}
                showLabels
                sx={{
                    height: 64,
                    bgcolor: 'transparent',
                    borderTop: 'none',
                    maxWidth: 600,
                    mx: 'auto',
                    '& .MuiBottomNavigationAction-root': {
                        minWidth: 0,
                        flex: 1,
                        padding: '6px 4px',
                        color: '#6b7f8a',
                        '&.Mui-selected': { color: '#13a4ec' }
                    }
                }}
            >
                <BottomNavigationAction label={t('nav.home')} icon={<HomeIcon />} sx={labelSx} />
                <BottomNavigationAction label={t('nav.records')} icon={<HistoryIcon />} sx={labelSx} />
                <BottomNavigationAction
                    label=""
                    aria-label={t('nav.add')}
                    icon={<AddIcon />}
                    sx={{
                        position: 'relative',
                        '& .MuiSvgIcon-root': {
                            width: 52,
                            height: 52,
                            padding: 1,
                            marginTop: '-18px',
                            borderRadius: '50%',
                            color: '#ffffff',
                            bgcolor: '#13a4ec',
                            border: '4px solid #ffffff',
                            boxSizing: 'content-box',
                            boxShadow: '0 6px 16px rgba(19, 164, 236, 0.35)'
                        },
                        '& .MuiBottomNavigationAction-label': { display: 'none' }
                    }}
                />
                <BottomNavigationAction label={t('nav.stats')} icon={<ShowChartIcon />} sx={labelSx} />
                <BottomNavigationAction label={t('nav.food')} icon={<RestaurantIcon />} sx={labelSx} />
            </BottomNavigation>
        </Paper>
    );
};

export default BottomNav;
