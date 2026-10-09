import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import { HomeIcon, ChartIcon as ShowChartIcon, FoodIcon as RestaurantIcon, HistoryIcon, AddIcon } from '../common/icons';

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
            sx={{ 
                position: 'fixed', 
                bottom: 0, 
                left: 0, 
                right: 0,
                display: 'block',
                width: '100%',
                minHeight: { xs: 60, sm: 64 },
                visibility: 'visible',
                zIndex: 1000,
                boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.08)',
                borderTop: '1px solid #e5e7eb'
            }} 
            elevation={3}
        >
            <BottomNavigation
                value={getNavValue()}
                onChange={(event, newValue) => {
                    switch(newValue) {
                        case 0:
                            history.push('/');
                            break;
                        case 1:
                            history.push('/timeline');
                            break;
                        case 2:
                            history.push('/?add=1');
                            break;
                        case 3:
                            history.push('/statistics');
                            break;
                        case 4:
                            history.push('/food-history');
                            break;
                    }
                }}
                showLabels
                sx={{
                    height: { xs: 60, sm: 64 },
                    width: '100%',
                    display: 'flex',
                    bgcolor: '#ffffff',
                    '& .MuiBottomNavigationAction-root': {
                        minWidth: 'auto',
                        padding: '6px 12px',
                        color: '#6b7f8a',
                        '&.Mui-selected': {
                            color: '#13a4ec'
                        }
                    }
                }}
            >
                <BottomNavigationAction 
                    label={t('nav.home')} 
                    icon={<HomeIcon />}
                    sx={{
                        '& .MuiBottomNavigationAction-label': {
                            fontSize: '12px',
                            fontWeight: 600,
                            marginTop: '4px',
                            '&.Mui-selected': {
                                fontSize: '12px'
                            }
                        }
                    }}
                />
                <BottomNavigationAction
                    label={t('nav.records')}
                    icon={<HistoryIcon />}
                    sx={{
                        '& .MuiBottomNavigationAction-label': {
                            fontSize: '12px',
                            fontWeight: 600,
                            marginTop: '4px',
                            opacity: 1,
                            '&.Mui-selected': {
                                fontSize: '12px'
                            }
                        }
                    }}
                />
                <BottomNavigationAction
                    label=""
                    aria-label={t('nav.add')}
                    icon={<AddIcon />}
                    sx={{
                        minWidth: 68,
                        position: 'relative',
                        zIndex: 1,
                        '& .MuiSvgIcon-root': {
                            width: 52,
                            height: 52,
                            padding: 1,
                            borderRadius: '50%',
                            color: '#ffffff',
                            bgcolor: '#13a4ec',
                            boxShadow: '0 4px 12px rgba(19, 164, 236, 0.35)'
                        },
                        '& .MuiBottomNavigationAction-label': { display: 'none' }
                    }}
                />
                <BottomNavigationAction
                    label={t('nav.stats')}
                    icon={<ShowChartIcon />}
                    sx={{
                        '& .MuiBottomNavigationAction-label': {
                            fontSize: '12px',
                            fontWeight: 600,
                            marginTop: '4px'
                        }
                    }}
                />
                <BottomNavigationAction
                    label={t('nav.food')}
                    icon={<RestaurantIcon />}
                    sx={{
                        '& .MuiBottomNavigationAction-label': {
                            fontSize: '12px',
                            fontWeight: 600,
                            marginTop: '4px'
                        }
                    }}
                />
            </BottomNavigation>
        </Paper>
    );
};

export default BottomNav;
