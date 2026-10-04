import React from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { CalendarDaysIcon as CalendarMonthIcon } from './icons';

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
    const today = new Date();
    const dates = Array.from({ length: 4 }, (_, index) => {
        const date = new Date(today);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - (3 - index));
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
                                flex: '0 0 58px',
                                minHeight: 58,
                                border: selected ? '2px solid #13a4ec' : '1px solid #dbe4ea',
                                borderRadius: 2,
                                bgcolor: selected ? '#e0f2fe' : '#ffffff',
                                color: selected ? '#0369a1' : '#475569',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                px: 0.5,
                                '&:hover': { bgcolor: '#e0f2fe' }
                            }}
                        >
                            <Typography component="span" sx={{ fontSize: 11, lineHeight: 1.2 }}>
                                {date.toLocaleDateString('ja-JP', { weekday: 'short' })}
                            </Typography>
                            <Typography component="span" sx={{ fontSize: 18, lineHeight: 1.2, fontWeight: 700 }}>
                                {date.getDate()}
                            </Typography>
                            {isSameDay(date, today) && (
                                <Typography component="span" sx={{ fontSize: 9, lineHeight: 1.1, fontWeight: 700 }}>
                                    今日
                                </Typography>
                            )}
                        </Box>
                    );
                })}
            </Box>
            {onOpenCalendar && (
                <Tooltip title="カレンダーを開く">
                    <IconButton onClick={onOpenCalendar} aria-label="カレンダーを開く" size="small">
                        <CalendarMonthIcon />
                    </IconButton>
                </Tooltip>
            )}
        </Box>
    );
};

export default RecentDaysStrip;