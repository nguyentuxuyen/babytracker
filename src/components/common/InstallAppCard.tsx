import React from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { promptInstall, usePwaInstall } from '../../utils/pwaInstall';
import { CloseIcon, InstallIcon } from './icons';

const DISMISS_KEY = 'babytracker.installBannerDismissed';

const readDismissed = () => {
    try {
        return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
        return false;
    }
};

interface InstallAppCardProps {
    // "banner": small dismissible card on Home, only on phones.
    // "section": always visible in Settings until the app is installed.
    variant: 'banner' | 'section';
}

// Installs the app to the home screen: a real button when the browser lets us
// (Chrome/Edge/Samsung on Android), otherwise short steps for the browser menu.
const InstallAppCard: React.FC<InstallAppCardProps> = ({ variant }) => {
    const { t } = useTranslation();
    const { canPrompt, installed, platform } = usePwaInstall();
    const [dismissed, setDismissed] = React.useState(readDismissed);

    if (installed) {
        return variant === 'section'
            ? <Typography sx={{ fontSize: 13, color: '#334155' }}>{t('install.installed')}</Typography>
            : null;
    }
    if (variant === 'banner' && (dismissed || (!canPrompt && platform === 'other'))) return null;

    const dismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(DISMISS_KEY, '1');
        } catch {
            // Private mode: hidden for this visit only.
        }
    };

    const hint = platform === 'ios' ? t('install.hintIos') : platform === 'android' ? t('install.hintAndroid') : t('install.hintDesktop');

    const body = (
        <>
            <Typography sx={{ fontSize: 13, color: '#334155' }}>{t('install.description')}</Typography>
            {canPrompt ? (
                <Button
                    variant="contained"
                    onClick={() => { void promptInstall(); }}
                    startIcon={<InstallIcon sx={{ fontSize: 18 }} />}
                    sx={{ mt: 1.25, textTransform: 'none', fontWeight: 700, borderRadius: '10px', bgcolor: '#13a4ec', boxShadow: 'none', '&:hover': { bgcolor: '#0e8fd9', boxShadow: 'none' } }}
                >
                    {t('install.button')}
                </Button>
            ) : (
                <Typography sx={{ fontSize: 13, color: '#0f172a', fontWeight: 600, mt: 1 }}>{hint}</Typography>
            )}
        </>
    );

    if (variant === 'section') return body;

    return (
        <Box
            role="region"
            aria-label={t('install.title')}
            sx={{ position: 'relative', p: 1.75, pr: 5, mb: 2, borderRadius: '16px', bgcolor: '#e0f2fe', border: '1px solid #bae6fd' }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Box component="img" src="/icon-192.png" alt="" sx={{ width: 28, height: 28, borderRadius: '8px' }} />
                <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#101c22' }}>{t('install.title')}</Typography>
            </Box>
            {body}
            <IconButton
                size="small"
                onClick={dismiss}
                aria-label={t('install.dismiss')}
                sx={{ position: 'absolute', top: 6, right: 6, color: '#475569' }}
            >
                <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
        </Box>
    );
};

export default InstallAppCard;
