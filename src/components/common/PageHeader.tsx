import React from 'react';
import { useHistory } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, IconButton, Typography } from '@mui/material';
import { BackIcon } from './icons';

/**
 * The title row every page starts with, so titles look the same everywhere:
 * optional back button, title + subtitle, optional action on the right.
 */
const PageHeader: React.FC<{
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    icon?: React.ReactNode;
    /** Show a back button (goes to the previous page, or Home when there is none). */
    back?: boolean;
    onBack?: () => void;
    action?: React.ReactNode;
}> = ({ title, subtitle, icon, back, onBack, action }) => {
    const history = useHistory();
    const { t } = useTranslation();

    const goBack = () => {
        if (onBack) return onBack();
        if (window.history.length > 1) history.goBack();
        else history.push('/');
    };

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, minHeight: 44 }}>
            {(back || onBack) && (
                <IconButton
                    aria-label={t('common.back')}
                    onClick={goBack}
                    sx={{ ml: -1, width: 40, height: 40, color: '#475569', flexShrink: 0 }}
                >
                    <BackIcon sx={{ fontSize: 20 }} />
                </IconButton>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                    component="h1"
                    sx={{ fontSize: 22, fontWeight: 800, color: '#101c22', lineHeight: 1.25, display: 'flex', alignItems: 'center', gap: 1 }}
                >
                    {icon}
                    <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</Box>
                </Typography>
                {subtitle && (
                    <Typography sx={{ fontSize: 13, color: '#5b6b75', mt: 0.25 }}>{subtitle}</Typography>
                )}
            </Box>
            {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
        </Box>
    );
};

export default PageHeader;
