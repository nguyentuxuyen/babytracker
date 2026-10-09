import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import i18n from '../i18n';

type State = { hasError: boolean };

// Shows a reload screen instead of a blank page when a page crashes while rendering.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Unhandled render error:', error, info.componentStack);
    }

    render() {
        if (!this.state.hasError) return this.props.children;
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', gap: 2, p: 2 }}>
                <Typography variant="h6">{i18n.t('errorBoundary.title')}</Typography>
                <Button variant="contained" onClick={() => window.location.reload()}>
                    {i18n.t('errorBoundary.reload')}
                </Button>
            </Box>
        );
    }
}

export default ErrorBoundary;
