import React, { useEffect, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { getDriveStatus } from '../../firebase/googleDrive';

type Result = 'connected' | 'cancelled' | 'error';

// Google sends the user back to the page they connected from with ?drive=<result>:
// show it once, drop the parameter and reload the connection status.
const DriveConnectNotice: React.FC = () => {
    const { t } = useTranslation();
    const [result, setResult] = useState<Result | null>(null);

    useEffect(() => {
        const url = new URL(window.location.href);
        const value = url.searchParams.get('drive');
        if (value !== 'connected' && value !== 'cancelled' && value !== 'error') return;
        url.searchParams.delete('drive');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
        setResult(value);
        void getDriveStatus(true).catch(() => undefined);
    }, []);

    return (
        <Snackbar open={result !== null} autoHideDuration={5000} onClose={() => setResult(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
            <Alert severity={result === 'connected' ? 'success' : result === 'cancelled' ? 'info' : 'error'} onClose={() => setResult(null)} sx={{ width: '100%' }}>
                {result === 'connected' ? t('settingsPage.drive.justConnected') : result === 'cancelled' ? t('settingsPage.drive.cancelled') : t('settingsPage.drive.error')}
            </Alert>
        </Snackbar>
    );
};

export default DriveConnectNotice;
