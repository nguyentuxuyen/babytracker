import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

const BottomNav: React.FC = () => {
    const history = useHistory();
    const location = useLocation();

    const getNavValue = () => {
        const path = location.pathname;
        if (path === '/' || path === '/activities') return 0;
        if (path === '/recent-activities') return 1;
        if (path === '/statistics') return 2;
        if (path === '/food-history') return 3;
        return 0;
    };

    return (
        <Paper 
            sx={{ 
                position: 'fixed', 
                bottom: 0, 
                left: 0, 
                right: 0,
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
                            history.push('/recent-activities');
                            break;
                        case 2:
                            history.push('/statistics');
                            break;
                        case 3:
                            history.push('/food-history');
                            break;
                    }
                }}
                showLabels
                sx={{
                    height: { xs: 60, sm: 64 },
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
                    label="ホーム" 
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
                    label="履歴" 
                    icon={<AccessTimeIcon />}
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
                    label="成長" 
                    icon={<ShowChartIcon />}
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
                    label="食事" 
                    icon={<RestaurantIcon />}
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
            </BottomNavigation>
        </Paper>
    );
};

export default BottomNav;
