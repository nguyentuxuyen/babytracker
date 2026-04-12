import React, { useState, useEffect } from 'react';
import { Typography } from '@mui/material';

export const SleepTimerDisplay: React.FC<{ startTime: Date }> = ({ startTime }) => {
    const [elapsedTime, setElapsedTime] = useState<number>(0);

    useEffect(() => {
        const updateElapsedTime = () => {
            const now = new Date();
            const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
            setElapsedTime(elapsed);
        };

        updateElapsedTime();
        const interval = setInterval(updateElapsedTime, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    const hours = Math.floor(elapsedTime / 3600);
    const minutes = Math.floor((elapsedTime % 3600) / 60);
    const seconds = elapsedTime % 60;

    return (
        <Typography sx={{ 
            fontSize: '14px', 
            color: '#f59e0b',
            fontWeight: 600,
            pl: 5
        }}>
            ⏱️ {hours > 0 ? `${hours}h ` : ''}{String(minutes).padStart(2, '0')}m {String(seconds).padStart(2, '0')}s
        </Typography>
    );
};
