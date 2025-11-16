import React from 'react';
import { Route, Redirect, RouteProps } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

interface PrivateRouteProps extends RouteProps {
    component: React.ComponentType<any>;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ component: Component, ...rest }) => {
    const { currentUser, loading } = useAuth();

    console.log('[PrivateRoute]', { 
        path: rest.path, 
        currentUser: currentUser ? currentUser.email : null, 
        loading 
    });

    return (
        <Route
            {...rest}
            render={(props) => {
                if (loading) {
                    console.log('[PrivateRoute] Showing loading spinner');
                    return (
                        <Box
                            sx={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                minHeight: '100vh',
                                bgcolor: '#f8fafc'
                            }}
                        >
                            <CircularProgress size={48} sx={{ color: '#13a4ec' }} />
                        </Box>
                    );
                }

                if (!currentUser) {
                    console.log('[PrivateRoute] No user, redirecting to /login');
                    return <Redirect to="/login" />;
                }

                console.log('[PrivateRoute] User authenticated, rendering component');
                return <Component {...props} />;
            }}
        />
    );
};

export default PrivateRoute;
