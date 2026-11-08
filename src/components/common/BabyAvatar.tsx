import React from 'react';
import { Box } from '@mui/material';
import { Baby } from '../../types';

/** The baby's photo in a circle, or a soft emoji placeholder when no photo was added yet. */
const BabyAvatar: React.FC<{ baby: Baby | null | undefined; size: number }> = ({ baby, size }) => (
    <Box
        aria-hidden
        sx={{
            width: size,
            height: size,
            flexShrink: 0,
            borderRadius: '50%',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #e0f2fe 0%, #fce7f3 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.round(size * 0.55),
            lineHeight: 1
        }}
    >
        {baby?.avatarUrl ? (
            <Box component="img" src={baby.avatarUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
            baby?.gender === 'female' ? '👧' : '👶'
        )}
    </Box>
);

export default BabyAvatar;
