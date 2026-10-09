import React from 'react';
import { Box, Typography } from '@mui/material';

// Soft filled input used by every field in the activity sheet.
export const fieldSx = {
    '& .MuiFilledInput-root': {
        bgcolor: '#f1f5f9',
        borderRadius: '14px',
        overflow: 'hidden',
        '&:before, &:after': { display: 'none' },
        '&:hover': { bgcolor: '#e9eef3' },
        '&.Mui-focused': { bgcolor: '#ffffff', boxShadow: '0 0 0 2px #13a4ec inset' },
        '&.Mui-disabled': { bgcolor: '#f8fafc' }
    },
    '& .MuiInputLabel-root': { color: '#6b7f8a' },
    '& .MuiInputLabel-root.Mui-focused': { color: '#13a4ec' }
} as const;

export const nativeTimeInputStyle: React.CSSProperties = {
    width: '100%',
    height: 52,
    padding: '0 16px',
    fontSize: '16px',
    border: 'none',
    borderRadius: '14px',
    backgroundColor: '#f1f5f9',
    color: '#101c22',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
};

export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#475569', mb: 1 }}>{children}</Typography>
);

type Option<T extends string> = {
    value: T;
    label: React.ReactNode;
    icon?: React.ReactNode;
};

// Pill-shaped single choice, like an iOS segmented control.
export function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    color = '#13a4ec'
}: {
    options: Option<T>[];
    value: T;
    onChange: (value: T) => void;
    color?: string;
}) {
    return (
        <Box role="radiogroup" sx={{ display: 'flex', gap: 0.5, p: 0.5, bgcolor: '#f1f5f9', borderRadius: '999px' }}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <Box
                        component="button"
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        sx={{
                            flex: 1,
                            minHeight: 44,
                            border: 'none',
                            borderRadius: '999px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 0.75,
                            fontFamily: 'inherit',
                            fontSize: 15,
                            fontWeight: 700,
                            cursor: 'pointer',
                            color: selected ? '#ffffff' : '#475569',
                            bgcolor: selected ? color : 'transparent',
                            boxShadow: selected ? '0 2px 8px rgba(15, 23, 42, 0.12)' : 'none',
                            transition: 'background-color 0.15s, color 0.15s',
                            '& svg': { fontSize: 18 }
                        }}
                    >
                        {option.icon}
                        {option.label}
                    </Box>
                );
            })}
        </Box>
    );
}

// Wrapping row of chips; single or multiple selection.
export function ChoiceChips<T extends string | number>({
    options,
    selected,
    onToggle,
    color = '#13a4ec'
}: {
    options: Array<{ value: T; label: React.ReactNode; dot?: string; danger?: boolean }>;
    selected: T[];
    onToggle: (value: T) => void;
    color?: string;
}) {
    return (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {options.map((option) => {
                const active = selected.includes(option.value);
                const tone = option.danger ? '#ef4444' : color;
                return (
                    <Box
                        component="button"
                        type="button"
                        aria-pressed={active}
                        key={String(option.value)}
                        onClick={() => onToggle(option.value)}
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.75,
                            minHeight: 40,
                            px: 1.75,
                            borderRadius: '999px',
                            border: `1.5px solid ${active ? tone : '#e2e8f0'}`,
                            bgcolor: active ? `${tone}14` : '#ffffff',
                            color: active ? tone : '#334155',
                            fontFamily: 'inherit',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        {option.dot && (
                            <Box component="span" sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: option.dot, border: '1px solid rgba(0,0,0,0.1)' }} />
                        )}
                        {option.label}
                    </Box>
                );
            })}
        </Box>
    );
}
