import React from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { CalendarDaysIcon as CalendarMonthIcon } from './icons';
import { localeTag } from '../../i18n';

type RecentDaysStripProps = {
    selectedDate: Date;
    onSelect: (date: Date) => void;
    onOpenCalendar?: () => void;
};

const isSameDay = (left: Date, right: Date) => (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
);

const RecentDaysStrip: React.FC<RecentDaysStripProps> = ({ selectedDate, onSelect, onOpenCalendar }) => {
    const { t } = useTranslation();
    const today = new Date();
    const dates = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - (6 - index));
        return date;
    });

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', flex: 1, pb: 0.5 }}>
                {dates.map((date) => {
                    const selected = isSameDay(date, selectedDate);
                    return (
                        <Box
                            component="button"
                            type="button"
                            key={date.toISOString()}
                            onClick={() => onSelect(date)}
                            aria-pressed={selected}
                            sx={{
                                flex: '1 0 40px',
                                minHeight: 56,
                                minWidth: 40,
                                border: selected ? '1px solid #13a4ec' : '1px solid #e5e7eb',
                                borderRadius: '14px',
                                bgcolor: selected ? '#13a4ec' : '#ffffff',
                                color: selected ? '#ffffff' : '#475569',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                px: 0.5,
                                '&:hover': { bgcolor: selected ? '#0f93d6' : '#f0f9ff' }
                            }}
                        >
                            <Typography component="span" sx={{ fontSize: 11, lineHeight: 1.2 }}>
                                {date.toLocaleDateString(localeTag(), { weekday: 'short' })}
                            </Typography>
                            <Typography component="span" sx={{ fontSize: 18, lineHeight: 1.2, fontWeight: 700 }}>
                                {date.getDate()}
                            </Typography>
                            <Box
                                component="span"
                                aria-label={isSameDay(date, today) ? t('common.today') : undefined}
                                sx={{
                                    width: 5,
                                    height: 5,
                                    mt: '3px',
                                    borderRadius: '50%',
                                    bgcolor: isSameDay(date, today) ? (selected ? '#ffffff' : '#13a4ec') : 'transparent'
                                }}
                            />
                        </Box>
                    );
                })}
            </Box>
            {onOpenCalendar && (
                <Tooltip title={t('common.openCalendar')}>
                    <IconButton onClick={onOpenCalendar} aria-label={t('common.openCalendar')} size="small">
                        <CalendarMonthIcon />
                    </IconButton>
                </Tooltip>
            )}
        </Box>
    );
};

export default RecentDaysStrip;