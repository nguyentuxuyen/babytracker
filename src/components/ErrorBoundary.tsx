import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import i18n from '../i18n';
import { isChunkLoadError, reloadForNewVersion } from '../utils/lazyPage';

type State = { error: Error | null };
type Props = {
    children: React.ReactNode;
    /** When this changes (e.g. the user opens another page), the error screen goes away. */
    resetKey?: unknown;
};

// Shows a reload screen instead of a blank page when a page crashes while rendering.
class ErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    componentDidUpdate(previous: Props) {
        if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
    }

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Unhandled render error:', error, info.componentStack);
        // A page file from an older release: reload to get the new one.
        if (isChunkLoadError(error)) reloadForNewVersion();
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '60vh', justifyContent: 'center', alignItems: 'center', gap: 2, p: 2, textAlign: 'center' }}>
                <Typography variant="h6">{i18n.t('errorBoundary.title')}</Typography>
                <Button variant="contained" onClick={() => window.location.reload()}>
                    {i18n.t('errorBoundary.reload')}
                </Button>
                {/* The cause, small, so a screenshot tells us what broke. */}
                <Typography sx={{ fontSize: 12, color: '#7d8b94', maxWidth: 360, overflowWrap: 'anywhere' }}>
                    {String(error.message || error).slice(0, 200)}
                </Typography>
            </Box>
        );
    }
}

export default ErrorBoundary;
