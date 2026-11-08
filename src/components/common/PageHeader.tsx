import React, { createContext, useContext, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { useHistory } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, IconButton, Typography } from '@mui/material';
import { BackIcon } from './icons';

/**
 * Where the app's top bar lets a page put its title. When a page shows a PageHeader, the title
 * (and back button, subtitle, action) sits inside the one sticky top bar instead of a second
 * title row under it, so every page has the same single, low header. Pages without a
 * PageHeader (Home) get the baby's name and age there.
 */
export interface PageHeaderSlot {
    element: HTMLElement | null;
    /** Called while a PageHeader is shown; returns the cleanup. */
    register: () => () => void;
}

export const PageHeaderSlotContext = createContext<PageHeaderSlot | null>(null);

/** One-line text that never wraps the header taller. */
const oneLine = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

/** The title block used both by pages and by the top bar's default (baby name + age). */
export const HeaderTitle: React.FC<{
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    icon?: React.ReactNode;
}> = ({ title, subtitle, icon }) => (
    <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
            component="h1"
            sx={{ fontSize: 18, fontWeight: 800, color: '#101c22', lineHeight: 1.25, display: 'flex', alignItems: 'center', gap: 0.75, '& svg': { fontSize: 20 } }}
        >
            {icon}
            <Box component="span" sx={oneLine}>{title}</Box>
        </Typography>
        {subtitle && (
            <Typography sx={{ fontSize: 12, color: '#5b6b75', lineHeight: 1.3, ...oneLine }}>{subtitle}</Typography>
        )}
    </Box>
);

/**
 * The title every page starts with, so titles look the same everywhere:
 * optional back button, title + subtitle, optional action on the right.
 * Shown inside the app's top bar when there is one, otherwise as a row on the page.
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
    const slot = useContext(PageHeaderSlotContext);
    const register = slot?.register;

    useLayoutEffect(() => (register ? register() : undefined), [register]);

    const goBack = () => {
        if (onBack) return onBack();
        if (window.history.length > 1) history.goBack();
        else history.push('/');
    };

    const inBar = Boolean(slot?.element);
    const content = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 40, flex: 1, minWidth: 0, ...(inBar ? {} : { mb: 1.5 }) }}>
            {(back || onBack) && (
                <IconButton
                    aria-label={t('common.back')}
                    onClick={goBack}
                    sx={{ ml: -1, mr: -0.5, width: 36, height: 36, color: '#475569', flexShrink: 0 }}
                >
                    <BackIcon sx={{ fontSize: 20 }} />
                </IconButton>
            )}
            <HeaderTitle title={title} subtitle={subtitle} icon={icon} />
            {action && <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{action}</Box>}
        </Box>
    );

    if (slot) {
        // Inside the app: only ever in the top bar (nothing until the bar has mounted).
        return slot.element ? ReactDOM.createPortal(content, slot.element) : null;
    }
    return content;
};

export default PageHeader;
